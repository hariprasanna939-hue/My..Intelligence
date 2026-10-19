"""Approvals API router for reviewing, executing, and reverting human-in-the-loop proposals."""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query

from app.config import settings
from app.database import get_file_backup_by_approval, get_setting
from app.schemas import ApprovalDecisionRequest, ApprovalItem
from app.services.approvals import get_approval, list_approvals, resolve_approval, revert_approval

router = APIRouter(prefix="/api/approvals", tags=["approvals"])


@router.get("", response_model=List[ApprovalItem])
async def get_all_approvals(
    status: Optional[str] = Query(None, description="Filter by pending, approved, rejected, executed, failed, reverted"),
    session_id: Optional[str] = Query(None, description="Filter by chat session ID"),
):
    """Lists approvals with optional status or session filtering."""
    return await list_approvals(status=status, session_id=session_id)


@router.get("/{approval_id}", response_model=ApprovalItem)
async def get_approval_by_id(approval_id: str):
    """Retrieves detailed information and diff for a specific approval item."""
    return await get_approval(approval_id)


@router.post("/{approval_id}/decide", response_model=ApprovalItem)
async def decide_approval(approval_id: str, req: ApprovalDecisionRequest):
    """Approve or reject a pending proposal (file write, patch, delete, or command execution)."""
    workspace = await get_setting("active_workspace", settings.ACTIVE_WORKSPACE)
    if not workspace:
        raise HTTPException(status_code=400, detail="Cannot execute approval without an active workspace.")

    return await resolve_approval(approval_id, req.decision, workspace)


@router.post("/{approval_id}/revert", response_model=ApprovalItem)
async def revert_approval_endpoint(approval_id: str):
    """Reverts an executed file change using its preserved backup or deletes newly created file."""
    workspace = await get_setting("active_workspace", settings.ACTIVE_WORKSPACE)
    if not workspace:
        raise HTTPException(status_code=400, detail="Cannot revert approval without an active workspace.")

    return await revert_approval(approval_id, workspace)


@router.get("/{approval_id}/backup")
async def get_approval_backup(approval_id: str):
    """Retrieves preserved file backup for an approval if available."""
    backup = await get_file_backup_by_approval(approval_id)
    if not backup:
        raise HTTPException(status_code=404, detail="No backup found for this approval.")
    return backup
