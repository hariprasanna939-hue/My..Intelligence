"""Typed Tool System and Registry for ForgeLocal Coding Agent.

Provides strictly bounded, safe, typed tools:
1. list_workspace_files (Read-Only)
2. search_filenames (Read-Only)
3. search_code_content (Read-Only)
4. read_file (Read-Only, with optional line range)
5. inspect_project_manifests (Read-Only)
6. read_test_output (Read-Only)
7. propose_new_file (Requires Approval)
8. propose_file_edit (Requires Approval, precomputes diff)
9. generate_patch (Requires Approval)
10. run_approved_test_command (Requires Approval)

Prevents any arbitrary shell execution or raw Python eval.
"""

from dataclasses import dataclass
import json
import logging
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional
from pydantic import BaseModel, Field

from app.config import settings
from app.database import get_db_connection
from app.security import resolve_safe_path, sanitize_text, validate_command
from app.services.approvals import create_approval
from app.services.project_understanding import (
    inspect_project_manifests as inspect_manifests_service,
    list_workspace_files as list_files_service,
    read_file_range,
    search_code_content as search_code_service,
    search_filenames as search_filenames_service,
)
from app.services.workspace import generate_unified_diff

logger = logging.getLogger("forgelocal.agent_tools")


# -------------------------------------------------------------
# Tool Parameter Schemas
# -------------------------------------------------------------

class ListFilesArgs(BaseModel):
    max_depth: int = Field(default=4, ge=1, le=8, description="Maximum directory traversal depth")
    max_files: int = Field(default=100, ge=1, le=500, description="Maximum number of files to return")


class SearchFilenamesArgs(BaseModel):
    pattern: str = Field(..., min_length=1, description="Wildcard or substring pattern to match (e.g. *test*)")


class SearchCodeArgs(BaseModel):
    query: str = Field(..., min_length=1, description="Code substring or identifier to search for")
    file_extensions: Optional[List[str]] = Field(default=None, description="Optional extensions to filter by (e.g. ['.py', '.ts'])")


class ReadFileArgs(BaseModel):
    path: str = Field(..., min_length=1, description="Relative path of file within workspace")
    start_line: Optional[int] = Field(default=None, ge=1, description="Optional 1-indexed start line")
    end_line: Optional[int] = Field(default=None, ge=1, description="Optional 1-indexed end line")


class ProposeNewFileArgs(BaseModel):
    path: str = Field(..., min_length=1, description="Relative path of the new file to create")
    content: str = Field(..., description="Complete source content of the new file")
    reason: str = Field(..., min_length=1, description="Detailed explanation of why this file is needed")


class ProposeFileEditArgs(BaseModel):
    path: str = Field(..., min_length=1, description="Relative path of the file to edit")
    content: str = Field(..., description="Complete updated source content for the file")
    reason: str = Field(..., min_length=1, description="Explanation of why the modification is needed")


class GeneratePatchArgs(BaseModel):
    path: str = Field(..., min_length=1, description="Relative path of target file")
    patch: str = Field(..., description="Standard unified diff patch string")
    reason: str = Field(..., min_length=1, description="Explanation of the patch")


class InspectManifestsArgs(BaseModel):
    pass


class ProposeTestCommandArgs(BaseModel):
    command_args: List[str] = Field(..., min_length=1, description="Command arguments (e.g. ['pytest', '-v'])")
    reason: str = Field(..., min_length=1, description="Reason for running this test or build command")


class ReadTestOutputArgs(BaseModel):
    execution_id: Optional[str] = Field(default=None, description="Optional test execution ID to read")



# -------------------------------------------------------------
# Tool Definition & Registry
# -------------------------------------------------------------

@dataclass
class ToolDefinition:
    name: str
    description: str
    is_read_only: bool
    args_schema: type[BaseModel]
    handler: Callable


class ToolRegistry:
    """Registry managing available agent tools."""

    def __init__(self):
        self._tools: Dict[str, ToolDefinition] = {}

    def register(
        self,
        name: str,
        description: str,
        is_read_only: bool,
        args_schema: type[BaseModel],
        handler: Callable,
    ):
        self._tools[name] = ToolDefinition(
            name=name,
            description=description,
            is_read_only=is_read_only,
            args_schema=args_schema,
            handler=handler,
        )

    def get_tool(self, name: str) -> Optional[ToolDefinition]:
        return self._tools.get(name)

    def list_tools(self) -> List[ToolDefinition]:
        return list(self._tools.values())

    def get_tools_prompt_description(self) -> str:
        """Builds a concise tool documentation block for model prompts."""
        lines = []
        for t in self._tools.values():
            schema = t.args_schema.model_json_schema()
            props = schema.get("properties", {})
            params_str = ", ".join(f"{k}: {v.get('type', 'any')}" for k, v in props.items())
            safety = "AUTO-EXECUTED (Read-Only)" if t.is_read_only else "REQUIRES USER APPROVAL"
            lines.append(f"- `{t.name}({params_str})`: {t.description} [{safety}]")
        return "\n".join(lines)


# -------------------------------------------------------------
# Tool Handlers Implementation
# -------------------------------------------------------------

async def tool_list_workspace_files(workspace_root: str, args: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    max_depth = args.get("max_depth", 4)
    max_files = args.get("max_files", 100)
    files = list_files_service(workspace_root, max_depth=max_depth, max_files=max_files)
    return {
        "status": "success",
        "file_count": len(files),
        "files": files[:80],
    }


async def tool_search_filenames(workspace_root: str, args: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    pattern = args.get("pattern", "*")
    matches = search_filenames_service(workspace_root, pattern, max_results=30)
    return {
        "status": "success",
        "pattern": pattern,
        "match_count": len(matches),
        "matches": matches,
    }


async def tool_search_code_content(workspace_root: str, args: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    query = args.get("query", "")
    exts = args.get("file_extensions")
    matches = search_code_service(workspace_root, query, file_extensions=exts, max_results=25)
    return {
        "status": "success",
        "query": query,
        "match_count": len(matches),
        "matches": [m.model_dump() for m in matches],
    }


async def tool_read_file(workspace_root: str, args: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    path = args.get("path", "")
    start_line = args.get("start_line")
    end_line = args.get("end_line")
    res = read_file_range(workspace_root, path, start_line=start_line, end_line=end_line)
    return {
        "status": "success",
        "path": res["relative_path"],
        "total_lines": res["total_lines"],
        "start_line": res["start_line"],
        "end_line": res["end_line"],
        "language": res["language"],
        "content": res["content"],
    }


async def tool_inspect_manifests(workspace_root: str, args: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    manifests = inspect_manifests_service(workspace_root)
    return {
        "status": "success",
        "manifests": manifests,
    }


async def tool_read_test_output(workspace_root: str, args: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    session_id = context.get("session_id")
    async with get_db_connection() as db:
        async with db.execute("""
            SELECT id, command, return_code, passed_tests, failed_tests, skipped_tests,
                   stdout, stderr, execution_time_ms, timed_out, created_at
            FROM test_executions
            WHERE session_id = ? OR session_id IS NULL
            ORDER BY created_at DESC LIMIT 1
        """, (session_id,)) as cursor:
            row = await cursor.fetchone()
            if row:
                return {"status": "success", "execution": dict(row)}
            return {"status": "not_found", "message": "No recent test execution found."}


async def tool_propose_new_file(workspace_root: str, args: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    rel_path = args.get("path", "").strip()
    content = args.get("content", "")
    reason = args.get("reason", "Propose new file")
    session_id = context.get("session_id")

    approval = await create_approval(
        session_id=session_id,
        action_type="write_file",
        reason=reason,
        target_path=rel_path,
        content=content,
        workspace_root=workspace_root,
    )
    return {
        "status": "pending_approval",
        "approval_id": approval.id,
        "target_path": approval.target_path,
        "diff": approval.diff,
        "message": "File proposal registered and waiting for user review.",
    }


async def tool_propose_file_edit(workspace_root: str, args: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    rel_path = args.get("path", "").strip()
    content = args.get("content", "")
    reason = args.get("reason", "Propose file modification")
    session_id = context.get("session_id")

    approval = await create_approval(
        session_id=session_id,
        action_type="write_file",
        reason=reason,
        target_path=rel_path,
        content=content,
        workspace_root=workspace_root,
    )
    return {
        "status": "pending_approval",
        "approval_id": approval.id,
        "target_path": approval.target_path,
        "diff": approval.diff,
        "message": "File edit proposal registered and waiting for user review.",
    }


async def tool_generate_patch(workspace_root: str, args: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    rel_path = args.get("path", "").strip()
    patch_str = args.get("patch", "")
    reason = args.get("reason", "Apply unified diff patch")
    session_id = context.get("session_id")

    approval = await create_approval(
        session_id=session_id,
        action_type="patch_file",
        reason=reason,
        target_path=rel_path,
        content=patch_str,
        workspace_root=workspace_root,
    )
    return {
        "status": "pending_approval",
        "approval_id": approval.id,
        "target_path": approval.target_path,
        "diff": approval.diff,
        "message": "Patch registered and waiting for user review.",
    }


async def tool_propose_test_command(workspace_root: str, args: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    cmd_args = args.get("command_args", [])
    reason = args.get("reason", "Run test command")
    session_id = context.get("session_id")

    # Validate against security allowlist before proposing
    validate_command(cmd_args)

    approval = await create_approval(
        session_id=session_id,
        action_type="run_command",
        reason=reason,
        command_args=cmd_args,
        workspace_root=workspace_root,
    )
    return {
        "status": "pending_approval",
        "approval_id": approval.id,
        "command_args": cmd_args,
        "message": f"Command '{' '.join(cmd_args)}' registered and waiting for user review.",
    }


# -------------------------------------------------------------
# Global Registry Initialization
# -------------------------------------------------------------

agent_tools = ToolRegistry()

agent_tools.register(
    name="list_workspace_files",
    description="Lists files and directory hierarchy up to a max depth.",
    is_read_only=True,
    args_schema=ListFilesArgs,
    handler=tool_list_workspace_files,
)

agent_tools.register(
    name="search_filenames",
    description="Searches files in the project by filename pattern or substring.",
    is_read_only=True,
    args_schema=SearchFilenamesArgs,
    handler=tool_search_filenames,
)

agent_tools.register(
    name="search_code_content",
    description="Searches text/identifiers in project files, returning lines and line numbers.",
    is_read_only=True,
    args_schema=SearchCodeArgs,
    handler=tool_search_code_content,
)

agent_tools.register(
    name="read_file",
    description="Reads a source file with optional line range (start_line, end_line).",
    is_read_only=True,
    args_schema=ReadFileArgs,
    handler=tool_read_file,
)

agent_tools.register(
    name="inspect_project_manifests",
    description="Inspects package.json, pyproject.toml, and build manifests.",
    is_read_only=True,
    args_schema=InspectManifestsArgs,
    handler=tool_inspect_manifests,
)

agent_tools.register(
    name="read_test_output",
    description="Reads the output, exit code, and test breakdown from the latest test run.",
    is_read_only=True,
    args_schema=ReadTestOutputArgs,
    handler=tool_read_test_output,
)

agent_tools.register(
    name="propose_new_file",
    description="Proposes creating a new file. Requires user approval before writing to disk.",
    is_read_only=False,
    args_schema=ProposeNewFileArgs,
    handler=tool_propose_new_file,
)

agent_tools.register(
    name="propose_file_edit",
    description="Proposes editing an existing file with before-and-after diff review. Requires user approval.",
    is_read_only=False,
    args_schema=ProposeFileEditArgs,
    handler=tool_propose_file_edit,
)

agent_tools.register(
    name="generate_patch",
    description="Proposes a unified patch to a file. Requires user approval.",
    is_read_only=False,
    args_schema=GeneratePatchArgs,
    handler=tool_generate_patch,
)

agent_tools.register(
    name="propose_test_command",
    description="Proposes executing an allowlisted test or build command (e.g. pytest). Requires user approval.",
    is_read_only=False,
    args_schema=ProposeTestCommandArgs,
    handler=tool_propose_test_command,
)


class SearchDocumentsArgs(BaseModel):
    query: str = Field(..., min_length=1, description="Keyword or question to search within uploaded documents")


async def tool_search_uploaded_documents(workspace_root: str, args: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    from app.services.document_index import search_document_chunks
    session_id = context.get("session_id")
    query = args.get("query", "")
    chunks = await search_document_chunks(query=query, session_id=session_id, limit=5)
    return {
        "status": "success",
        "query": query,
        "match_count": len(chunks),
        "matches": [
            {
                "citation": ch.citation(),
                "filename": ch.filename,
                "page": ch.page_number,
                "section": ch.section_heading,
                "content": ch.content[:400] + ("..." if len(ch.content) > 400 else ""),
            }
            for ch in chunks
        ],
    }


agent_tools.register(
    name="search_uploaded_documents",
    description="Searches extracted content and citations from user-uploaded PDF, DOCX, CSV, JSON, or text documents.",
    is_read_only=True,
    args_schema=SearchDocumentsArgs,
    handler=tool_search_uploaded_documents,
)
