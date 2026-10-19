"""Tests for File Backups and Approval Revert System."""

from pathlib import Path
import pytest
from app.config import settings
from app.database import (
    get_file_backup_by_approval,
    init_db,
    save_file_backup,
)
from app.services.approvals import (
    create_approval,
    get_approval,
    resolve_approval,
    revert_approval,
)


@pytest.mark.asyncio
async def test_file_backup_and_revert_existing_file(tmp_path: Path):
    """Applying an approval to an existing file backs it up, and reverting restores original contents."""
    settings.DATA_DIR = tmp_path
    settings.DB_FILENAME = "test_backups.db"
    await init_db()

    ws = tmp_path / "workspace"
    ws.mkdir()
    target_file = ws / "module.py"
    original_code = "def existing():\n    return 'original'\n"
    target_file.write_text(original_code, encoding="utf-8")

    # 1. Propose edit
    new_code = "def existing():\n    return 'modified'\n"
    approval = await create_approval(
        session_id=None,
        action_type="write_file",
        reason="Upgrade existing function",
        target_path="module.py",
        content=new_code,
        workspace_root=str(ws),
    )
    assert approval.status == "pending"
    assert approval.diff is not None

    # 2. Apply approval
    executed = await resolve_approval(approval.id, "approve", str(ws))
    assert executed.status == "executed"
    assert target_file.read_text(encoding="utf-8") == new_code

    # 3. Check backup was saved in SQLite
    backup = await get_file_backup_by_approval(approval.id)
    assert backup is not None
    assert backup["target_path"] == "module.py"
    assert backup["original_content"] == original_code

    # 4. Revert approval
    reverted = await revert_approval(approval.id, str(ws))
    assert reverted.status == "reverted"
    # Target file should now have original code restored
    assert target_file.read_text(encoding="utf-8") == original_code


@pytest.mark.asyncio
async def test_revert_newly_created_file_deletes_it(tmp_path: Path):
    """Applying an approval that creates a new file, then reverting, unlinks the file."""
    settings.DATA_DIR = tmp_path
    settings.DB_FILENAME = "test_backups_new.db"
    await init_db()

    ws = tmp_path / "workspace"
    ws.mkdir()
    new_file = ws / "brand_new.py"
    assert not new_file.exists()

    approval = await create_approval(
        session_id=None,
        action_type="write_file",
        reason="Create brand new helper",
        target_path="brand_new.py",
        content="def brand_new(): pass\n",
        workspace_root=str(ws),
    )
    assert approval.status == "pending"

    # Apply
    await resolve_approval(approval.id, "approve", str(ws))
    assert new_file.exists()
    assert "brand_new" in new_file.read_text(encoding="utf-8")

    # Revert
    reverted = await revert_approval(approval.id, str(ws))
    assert reverted.status == "reverted"
    # File must be deleted
    assert not new_file.exists()
