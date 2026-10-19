"""Unit tests for approval workflows and human-in-the-loop safety."""

from pathlib import Path
import pytest

from app.config import settings
from app.database import init_db
from app.services.approvals import (
    create_approval,
    get_approval,
    list_approvals,
    resolve_approval,
)


@pytest.mark.asyncio
async def test_approval_lifecycle(tmp_path: Path):
    # Setup test db
    test_db = tmp_path / "test.db"
    settings.DATA_DIR = tmp_path
    settings.DB_FILENAME = "test.db"
    await init_db()

    workspace = tmp_path / "workspace"
    workspace.mkdir()
    target_file = "utils.py"

    # Step 1: Propose writing a file
    approval = await create_approval(
        session_id=None,
        action_type="write_file",
        reason="Implement helper functions",
        target_path=target_file,
        content="def helper(): return True\n",
        workspace_root=str(workspace),
    )

    assert approval.status == "pending"
    assert approval.diff is not None
    # Crucial security check: file MUST NOT exist on disk yet!
    assert not (workspace / target_file).exists()

    # Step 2: List pending approvals
    pending = await list_approvals(status="pending")
    assert any(p.id == approval.id for p in pending)

    # Step 3: Approve proposal
    resolved = await resolve_approval(approval.id, decision="approve", workspace_root=str(workspace))
    assert resolved.status == "executed"
    
    # Verify file is now written
    assert (workspace / target_file).exists()
    assert (workspace / target_file).read_text() == "def helper(): return True\n"


@pytest.mark.asyncio
async def test_approval_rejection(tmp_path: Path):
    test_db = tmp_path / "test2.db"
    settings.DATA_DIR = tmp_path
    settings.DB_FILENAME = "test2.db"
    await init_db()

    workspace = tmp_path / "workspace2"
    workspace.mkdir()
    target_file = "delete_me.py"
    (workspace / target_file).write_text("important data")

    # Propose delete
    approval = await create_approval(
        session_id=None,
        action_type="delete_file",
        reason="Test rejection",
        target_path=target_file,
        workspace_root=str(workspace),
    )

    # Reject
    resolved = await resolve_approval(approval.id, decision="reject", workspace_root=str(workspace))
    assert resolved.status == "rejected"
    # File MUST still exist!
    assert (workspace / target_file).exists()
