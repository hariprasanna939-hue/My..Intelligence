"""Approvals API router for reviewing and executing human-in-the-loop proposals."""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query

from app.config import settings
from app.database import get_setting
from app.schemas import ApprovalDecisionRequest, ApprovalItem
from app.services.approvals import get_approval, list_approvals, resolve_approval

router = APIRouter(prefix="/api/approvals", tags=["approvals"])


@router.get("", response_model=List[ApprovalItem])
async def get_all_approvals(
    status: Optional[str] = Query(None, description="Filter by pending, approved, rejected, executed, failed"),
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
