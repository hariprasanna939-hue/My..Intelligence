"""AI Coding Agent Orchestrator.

Guides local models (like qwen2.5-coder:7b) to reason, inspect workspace files,
propose changes, and generate controlled tests while respecting human approval boundaries.
"""

import json
from pathlib import Path
import re
from typing import Any, AsyncGenerator, Dict, List, Optional

from app.config import settings
from app.services.approvals import create_approval
from app.services.ollama_client import ollama_client
from app.services.project_understanding import gather_project_context
from app.services.workspace import read_file_safely


SYSTEM_PROMPT_TEMPLATE = """You are ForgeLocal, a trustworthy local AI coding agent running entirely on the user's computer.
Your job is to help the user understand, navigate, write, edit, debug, and test code in their local workspace.

CRITICAL GROUNDING & ACCURACY RULES:
1. Base your explanation, diagnosis, architecture analysis, and code proposals STRICTLY on the actual files and evidence in the workspace context below.
2. DO NOT invent, fabricate, or hallucinate filenames, functions, classes, imports, endpoints, or modules that do not exist.
3. If necessary context cannot be found in the project files, explicitly state what files or patterns were checked and what information is missing.
4. You CANNOT directly execute commands or write files silently. All destructive changes (file writes, patches, deletions, command executions) must be proposed using the structured action block for user review.
5. Provide complete, working, idiomatic code rather than incomplete placeholders.

WORKSPACE CONTEXT:
Active Workspace: {workspace_path}

{project_context}

{open_file_context}

ACTION CAPABILITIES:
When you want to propose a file change or suggest running a test command, output a structured JSON action block in the following format:

```forgelocal-action
{{
  "action": "propose_file_write",
  "path": "path/to/file.py",
  "content": "<full file content>",
  "reason": "Brief explanation of changes"
}}
```

Or for running tests or allowlisted commands:
```forgelocal-action
{{
  "action": "propose_command",
  "command_args": ["pytest", "-v"],
  "reason": "Run test suite to verify implementation"
}}
```

Available commands for propose_command: {allowed_commands}.

If simply answering questions, explaining code, or discussing ideas, respond normally in clear Markdown without any forgelocal-action block.
"""


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
    allowed_cmds_str = ", ".join(settings.ALLOWED_COMMANDS)

    base = SYSTEM_PROMPT_TEMPLATE.format(
        workspace_path=workspace_str,
        project_context=project_context,
        open_file_context=open_file_context,
        allowed_commands=allowed_cmds_str,
    )
    return base + mode_instructions


# Regex to detect action blocks emitted by the model
ACTION_BLOCK_REGEX = re.compile(r"```forgelocal-action\s*([\s\S]*?)\s*```")


def extract_actions(text: str) -> List[Dict[str, Any]]:
    """Extracts JSON action blocks from model response with fallback for unescaped content."""
    actions = []
    matches = ACTION_BLOCK_REGEX.findall(text)
    for raw in matches:
        raw_str = raw.strip()
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

            # Extract content (handles triple-quotes or standard quotes)
            content_match = re.search(
                r'"content"\s*:\s*(?:"""|\'\'\'|")([\s\S]*?)(?:"""|\'\'\'|")\s*(?:,\s*"reason"|\s*})',
                raw_str,
            )
            if content_match:
                parsed["content"] = content_match.group(1)

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
        
        if action_type == "propose_file_write":
            raw_path = act.get("path")
            content = act.get("content", "")
            if raw_path and workspace_path:
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

        elif action_type == "propose_command":
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
