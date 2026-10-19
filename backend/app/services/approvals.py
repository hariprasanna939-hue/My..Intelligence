"""Human-in-the-Loop Approvals Service.

Manages approval requests for destructive or state-modifying actions:
- writing files
- patching existing files (with unified diff preview)
- deleting files
- running shell commands
"""

from datetime import datetime, timezone
import json
from pathlib import Path
from typing import List, Optional
import uuid
from fastapi import HTTPException

from app.database import get_db_connection
from app.schemas import ActionType, ApprovalDecisionRequest, ApprovalItem, ApprovalStatus
from app.services.command_runner import execute_command
from app.services.workspace import (
    delete_file_safely,
    generate_unified_diff,
    read_file_safely,
    write_file_safely,
)


async def create_approval(
    session_id: Optional[str],
    action_type: ActionType,
    reason: str,
    target_path: Optional[str] = None,
    content: Optional[str] = None,
    command_args: Optional[List[str]] = None,
    workspace_root: Optional[str] = None,
) -> ApprovalItem:
    """Creates a new pending approval item with computed diffs where applicable."""
    approval_id = str(uuid.uuid4())
    original_content = None
    diff = None

    # If action is writing/patching a file, attempt to read existing content to generate diff
    if action_type in ("write_file", "patch_file") and target_path and workspace_root:
        try:
            existing = read_file_safely(workspace_root, target_path)
            original_content = existing.content
            diff = generate_unified_diff(original_content, content or "", filename=target_path)
        except Exception:
            # File might be brand new
            original_content = ""
            diff = generate_unified_diff("", content or "", filename=target_path)
    elif action_type == "delete_file" and target_path and workspace_root:
        try:
            existing = read_file_safely(workspace_root, target_path)
            original_content = existing.content
            diff = generate_unified_diff(original_content, "", filename=target_path)
        except Exception:
            pass

    now_iso = datetime.now(timezone.utc).isoformat()
    cmd_json = json.dumps(command_args) if command_args else None

    async with get_db_connection() as db:
        await db.execute("""
            INSERT INTO approvals (
                id, session_id, action_type, target_path, content,
                original_content, diff, command_args, reason, status,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        """, (
            approval_id,
            session_id,
            action_type,
            target_path,
            content,
            original_content,
            diff,
            cmd_json,
            reason,
            now_iso,
        ))
        await db.commit()

    return ApprovalItem(
        id=approval_id,
        session_id=session_id,
        action_type=action_type,
        target_path=target_path,
        content=content,
        original_content=original_content,
        diff=diff,
        command_args=command_args,
        reason=reason,
        status="pending",
        execution_result=None,
        created_at=now_iso,
        resolved_at=None,
    )


async def list_approvals(
    status: Optional[str] = None, 
    session_id: Optional[str] = None
) -> List[ApprovalItem]:
    """Retrieves approvals filtered optionally by status or session."""
    query = "SELECT * FROM approvals WHERE 1=1"
    params = []
    if status:
        query += " AND status = ?"
        params.append(status)
    if session_id:
        query += " AND session_id = ?"
        params.append(session_id)
    query += " ORDER BY created_at DESC"

    items: List[ApprovalItem] = []
    async with get_db_connection() as db:
        async with db.execute(query, tuple(params)) as cursor:
            rows = await cursor.fetchall()
            for r in rows:
                cmd_list = json.loads(r["command_args"]) if r["command_args"] else None
                items.append(
                    ApprovalItem(
                        id=r["id"],
                        session_id=r["session_id"],
                        action_type=r["action_type"],
                        target_path=r["target_path"],
                        content=r["content"],
                        original_content=r["original_content"],
                        diff=r["diff"],
                        command_args=cmd_list,
                        reason=r["reason"],
                        status=r["status"],
                        execution_result=r["execution_result"],
                        created_at=r["created_at"],
                        resolved_at=r["resolved_at"],
                    )
                )
    return items


async def get_approval(approval_id: str) -> ApprovalItem:
    """Retrieves a single approval item by ID."""
    async with get_db_connection() as db:
        async with db.execute("SELECT * FROM approvals WHERE id = ?", (approval_id,)) as cursor:
            r = await cursor.fetchone()
            if not r:
                raise HTTPException(status_code=404, detail="Approval request not found.")
            cmd_list = json.loads(r["command_args"]) if r["command_args"] else None
            return ApprovalItem(
                id=r["id"],
                session_id=r["session_id"],
                action_type=r["action_type"],
                target_path=r["target_path"],
                content=r["content"],
                original_content=r["original_content"],
                diff=r["diff"],
                command_args=cmd_list,
                reason=r["reason"],
                status=r["status"],
                execution_result=r["execution_result"],
                created_at=r["created_at"],
                resolved_at=r["resolved_at"],
            )


async def resolve_approval(
    approval_id: str,
    decision: str,
    workspace_root: str,
) -> ApprovalItem:
    """Executes or rejects an approval item."""
    approval = await get_approval(approval_id)
    if approval.status != "pending":
        raise HTTPException(
            status_code=400, 
            detail=f"Approval is already resolved with status '{approval.status}'."
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    new_status = "rejected"
    result_str = None

    if decision == "approve":
        try:
            if approval.action_type in ("write_file", "patch_file"):
                if not approval.target_path or approval.content is None:
                    raise ValueError("Target path or content missing.")
                
                # Check if target already exists and preserve backup before overwriting
                from app.database import save_file_backup
                from app.security import resolve_safe_path
                target_full = resolve_safe_path(workspace_root, approval.target_path)
                if target_full.exists() and target_full.is_file():
                    existing_text = target_full.read_text(encoding="utf-8", errors="replace")
                    backup_id = str(uuid.uuid4())
                    await save_file_backup(backup_id, approval_id, approval.target_path, existing_text)

                write_file_safely(workspace_root, approval.target_path, approval.content)
                result_str = f"Successfully wrote file '{approval.target_path}' ({len(approval.content)} chars)."
                new_status = "executed"

            elif approval.action_type == "delete_file":
                if not approval.target_path:
                    raise ValueError("Target path missing.")
                delete_file_safely(workspace_root, approval.target_path)
                result_str = f"Successfully deleted file '{approval.target_path}'."
                new_status = "executed"

            elif approval.action_type == "run_command":
                if not approval.command_args:
                    raise ValueError("Command arguments missing.")
                cmd_res = await execute_command(approval.command_args, workspace_root)
                result_str = f"Exit code {cmd_res.return_code}. Output:\n{cmd_res.stdout}\n{cmd_res.stderr}".strip()
                new_status = "executed" if cmd_res.return_code == 0 else "failed"

            else:
                raise ValueError(f"Unknown action type: {approval.action_type}")

        except Exception as e:
            new_status = "failed"
            result_str = f"Execution error: {str(e)}"
    else:
        new_status = "rejected"
        result_str = "Action rejected by user."

    async with get_db_connection() as db:
        await db.execute("""
            UPDATE approvals 
            SET status = ?, execution_result = ?, resolved_at = ?
            WHERE id = ?
        """, (new_status, result_str, now_iso, approval_id))
        await db.commit()

    return await get_approval(approval_id)


async def revert_approval(
    approval_id: str,
    workspace_root: str,
) -> ApprovalItem:
    """Reverts an executed file modification using preserved backup or deletes newly created file."""
    approval = await get_approval(approval_id)
    if approval.status != "executed":
        raise HTTPException(
            status_code=400,
            detail=f"Only executed approvals can be reverted. Current status is '{approval.status}'.",
        )
    if approval.action_type not in ("write_file", "patch_file"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot revert non-file action type '{approval.action_type}'.",
        )

    from app.database import get_file_backup_by_approval
    backup = await get_file_backup_by_approval(approval_id)

    now_iso = datetime.now(timezone.utc).isoformat()
    if backup:
        # Restore previous content
        write_file_safely(workspace_root, approval.target_path, backup["original_content"])
        revert_msg = f"Reverted file '{approval.target_path}' to preserved backup version."
    elif approval.original_content:
        # Restore original content recorded during creation
        write_file_safely(workspace_root, approval.target_path, approval.original_content)
        revert_msg = f"Reverted file '{approval.target_path}' to initial recorded content."
    else:
        # File was newly created by the approval, so delete it to revert
        try:
            delete_file_safely(workspace_root, approval.target_path)
            revert_msg = f"Reverted file creation by deleting newly created file '{approval.target_path}'."
        except Exception as e:
            revert_msg = f"Revert deletion warning: {str(e)}"

    async with get_db_connection() as db:
        await db.execute("""
            UPDATE approvals 
            SET status = 'reverted', execution_result = ?, resolved_at = ?
            WHERE id = ?
        """, (revert_msg, now_iso, approval_id))
        await db.commit()

    return await get_approval(approval_id)
