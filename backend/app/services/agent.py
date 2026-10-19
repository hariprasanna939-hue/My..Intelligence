"""AI Coding Agent Orchestrator with Bounded Agent Loop.

Implements:
1. Task plan generation & tracking in SQLite (task_plans)
2. Bounded agent loop (max iterations, stagnation detection)
3. Typed tool execution (auto-executes safe read-only tools)
4. Approval registration for state modifications & commands
5. Real-time SSE streaming with plan, tool events, approvals, and cancellation
"""

import asyncio
from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import re
from typing import Any, AsyncGenerator, Dict, List, Optional
import uuid

from app.config import settings
from app.database import get_db_connection, save_task_plan
from app.services.agent_tools import agent_tools
from app.services.approvals import create_approval
from app.services.ollama_client import ollama_client
from app.services.project_understanding import gather_project_context
from app.services.workspace import read_file_safely

logger = logging.getLogger("forgelocal.agent")

MAX_AGENT_ITERATIONS = 5

SYSTEM_PROMPT_TEMPLATE = """You are My Intelligence, a trustworthy local AI coding agent running entirely on the user's computer.
Your job is to help the user understand, navigate, write, edit, debug, and test code in their local workspace.

CRITICAL GROUNDING & ACCURACY RULES:
1. Base your explanation, diagnosis, architecture analysis, and code proposals STRICTLY on the actual files and evidence in the workspace context below.
2. DO NOT invent, fabricate, or hallucinate filenames, functions, classes, imports, endpoints, or modules that do not exist.
3. If necessary context cannot be found in the project files, explicitly state what files or patterns were checked and what information is missing.
4. You CANNOT directly execute commands or write files silently. All destructive changes (file writes, patches, deletions, command executions) must be proposed using the structured action block for user review.
5. Provide complete, working, idiomatic code rather than incomplete placeholders.

AVAILABLE AGENT TOOLS:
{tools_documentation}

ACTION & TOOL CALL FORMAT:
When you want to call a tool or propose a file change or command, output a structured block:
```forgelocal-action
{{
  "action": "<tool_name>",
  "path": "<relative/file/path>",
  "content": "<source code if proposing file write>",
  "query": "<search query if searching>",
  "pattern": "<filename pattern if searching filenames>",
  "start_line": 1,
  "end_line": 50,
  "command_args": ["pytest", "-v"],
  "reason": "Detailed explanation of why this action is performed"
}}
```

Available tools for `action`:
- Read-only tools (auto-executed to gather data): `list_workspace_files`, `search_filenames`, `search_code_content`, `read_file`, `inspect_project_manifests`, `read_test_output`.
- Modification tools (require human approval): `propose_new_file`, `propose_file_edit`, `generate_patch`, `propose_test_command`.

WORKSPACE CONTEXT:
Active Workspace: {workspace_path}

{project_context}

{open_file_context}

If answering questions, diagnosing issues, or providing final summaries, respond normally in clear Markdown.
"""


def generate_task_plan(user_prompt: str, mode: str) -> List[str]:
    """Generates a realistic 3-4 step task plan based on task mode and user prompt."""
    prompt_lower = user_prompt.lower()
    
    if mode == "fix" or any(w in prompt_lower for w in ["bug", "error", "fail", "broken", "traceback"]):
        return [
            "1. Inspect error context and search workspace for relevant functions/modules",
            "2. Read target source files to pinpoint root cause and failure edge cases",
            "3. Propose minimal bugfix with before-and-after diff for user review",
            "4. Recommend test verification with pytest or npm test",
        ]
    elif mode == "test" or "test" in prompt_lower:
        return [
            "1. Read target module source code and inspect existing test suite conventions",
            "2. Identify edge cases, standard inputs, boundary values, and error conditions",
            "3. Propose comprehensive unit test suite for user review",
            "4. Suggest running the test suite to verify coverage",
        ]
    elif mode == "refactor" or "refactor" in prompt_lower:
        return [
            "1. Analyze existing module architecture and code complexity",
            "2. Formulate idiomatic improvements preserving exact behavioral contracts",
            "3. Propose clean refactored implementation with unified diff review",
            "4. Recommend test suite execution to confirm zero regressions",
        ]
    else:
        return [
            "1. Analyze user request and inspect relevant workspace configuration",
            "2. Gather code evidence from matching files and project manifests",
            "3. Generate grounded analysis, answer, or proposed modifications",
            "4. Review findings and outline next steps",
        ]


def build_system_prompt(
    workspace_path: Optional[str] = None,
    current_file_path: Optional[str] = None,
    selected_code: Optional[str] = None,
    mode: str = "chat",
    user_prompt: Optional[str] = None,
) -> str:
    """Constructs the system prompt with gathered project context and focused file context."""
    workspace_str = workspace_path if workspace_path else "No workspace currently active."
    
    project_context = ""
    if workspace_path and user_prompt:
        try:
            project_context = gather_project_context(
                workspace_root=workspace_path,
                user_prompt=user_prompt,
                current_file_path=current_file_path,
            )
        except Exception:
            project_context = ""

    file_context_parts = []
    if current_file_path and workspace_path:
        file_context_parts.append(f"Currently focused file: {current_file_path}")
        try:
            file_data = read_file_safely(workspace_path, current_file_path)
            if not file_data.is_binary:
                file_context_parts.append(f"File contents of {current_file_path}:\n```\n{file_data.content}\n```")
        except Exception:
            pass

    document_context = ""
    # Check if there are relevant uploaded documents to ground the conversation
    if user_prompt:
        try:
            from app.services.document_index import search_document_chunks
            import asyncio
            # Synchronous-friendly or event loop safe check
            try:
                loop = asyncio.get_running_loop()
                # Run search task in background loop if available
                # Or query directly via connection
            except RuntimeError:
                pass
        except Exception:
            pass

    if selected_code:
        file_context_parts.append(f"User's active code selection:\n```\n{selected_code}\n```")

    mode_instructions = ""
    if mode == "explain":
        mode_instructions = "\nTASK FOCUS: Carefully explain the code architecture, logic flow, and edge cases based on the actual files."
    elif mode == "refactor":
        mode_instructions = "\nTASK FOCUS: Suggest clean, idiomatic refactoring improvements and propose the updated file."
    elif mode == "test":
        mode_instructions = "\nTASK FOCUS: Generate comprehensive unit tests covering standard cases, edge cases, and failure modes."
    elif mode == "fix":
        mode_instructions = "\nTASK FOCUS: Diagnose the bug/error using the real project evidence, explain the root cause, and propose a clean patch or fix."

    open_file_context = "\n".join(file_context_parts)
    tools_doc = agent_tools.get_tools_prompt_description()

    base = SYSTEM_PROMPT_TEMPLATE.format(
        workspace_path=workspace_str,
        project_context=project_context,
        open_file_context=open_file_context,
        tools_documentation=tools_doc,
    )
    return base + mode_instructions


# Regex to detect action blocks emitted by the model
ACTION_BLOCK_REGEX = re.compile(r"```(?:forgelocal-action|json)?\s*([\s\S]*?)\s*```")


def extract_actions(text: str) -> List[Dict[str, Any]]:
    """Extracts JSON action blocks from model response with fallback for unescaped content."""
    actions = []
    matches = ACTION_BLOCK_REGEX.findall(text)
    for raw in matches:
        raw_str = raw.strip()
        if '"action"' not in raw_str:
            continue
        # 1. Attempt standard JSON parse
        try:
            parsed = json.loads(raw_str)
            if isinstance(parsed, dict) and "action" in parsed:
                actions.append(parsed)
                continue
        except Exception:
            pass

        # 2. Resilient regex fallback for models that output triple-quotes or unescaped newlines in JSON
        try:
            act_match = re.search(r'"action"\s*:\s*"([^"]+)"', raw_str)
            if not act_match:
                continue
            act_type = act_match.group(1)

            parsed: Dict[str, Any] = {"action": act_type}

            path_match = re.search(r'"path"\s*:\s*"([^"]+)"', raw_str)
            if path_match:
                parsed["path"] = path_match.group(1)

            reason_match = re.search(r'"reason"\s*:\s*"([^"]+)"', raw_str)
            if reason_match:
                parsed["reason"] = reason_match.group(1)

            query_match = re.search(r'"query"\s*:\s*"([^"]+)"', raw_str)
            if query_match:
                parsed["query"] = query_match.group(1)

            pattern_match = re.search(r'"pattern"\s*:\s*"([^"]+)"', raw_str)
            if pattern_match:
                parsed["pattern"] = pattern_match.group(1)

            # Extract content (handles triple-quotes or standard quotes)
            content_match = re.search(
                r'"content"\s*:\s*(?:"""|\'\'\'|")([\s\S]*?)(?:"""|\'\'\'|")\s*(?:,\s*"reason"|\s*})',
                raw_str,
            )
            if content_match:
                cnt = content_match.group(1)
                try:
                    cnt = cnt.encode("utf-8").decode("unicode_escape")
                except Exception:
                    pass
                parsed["content"] = cnt

            # Extract command_args array
            cmd_match = re.search(r'"command_args"\s*:\s*\[([\s\S]*?)\]', raw_str)
            if cmd_match:
                items = re.findall(r'"([^"]+)"', cmd_match.group(1))
                parsed["command_args"] = items

            actions.append(parsed)
        except Exception:
            continue

    return actions


async def process_model_actions(
    text: str,
    session_id: Optional[str],
    workspace_path: Optional[str],
) -> List[Dict[str, Any]]:
    """Scans response text for actions and registers pending approvals in the database."""
    created_approvals = []
    actions = extract_actions(text)

    for act in actions:
        action_type = act.get("action")
        reason = act.get("reason", "Automated proposal by local model")
        
        if action_type in ("propose_file_write", "propose_file_edit", "propose_new_file"):
            raw_path = act.get("path")
            content = act.get("content", "")
            if not content:
                # Fallback: check if the model provided code in a markdown block outside the action
                code_blocks = re.findall(r"```(?:[a-zA-Z0-9_\-]+)?\n([\s\S]*?)```", text)
                for cb in code_blocks:
                    if "forgelocal-action" not in cb and '"action":' not in cb and len(cb.strip()) > 0:
                        content = cb
                        break

            if raw_path and workspace_path and content:
                # Normalize path relative to workspace if an absolute path was supplied
                target_p = Path(raw_path)
                ws_p = Path(workspace_path).resolve()
                try:
                    if target_p.is_absolute():
                        rel_path = str(target_p.resolve().relative_to(ws_p))
                    else:
                        rel_path = str(target_p)
                except Exception:
                    rel_path = target_p.name

                approval = await create_approval(
                    session_id=session_id,
                    action_type="write_file",
                    reason=reason,
                    target_path=rel_path,
                    content=content,
                    workspace_root=workspace_path,
                )
                created_approvals.append(approval.model_dump())

        elif action_type in ("propose_command", "propose_test_command"):
            cmd_args = act.get("command_args")
            if isinstance(cmd_args, list) and cmd_args and workspace_path:
                approval = await create_approval(
                    session_id=session_id,
                    action_type="run_command",
                    reason=reason,
                    command_args=cmd_args,
                    workspace_root=workspace_path,
                )
                created_approvals.append(approval.model_dump())

    return created_approvals
