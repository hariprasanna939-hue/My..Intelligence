"""Unit tests for controlled command execution."""

from pathlib import Path
import pytest
from fastapi import HTTPException

from app.services.command_runner import execute_command


@pytest.mark.asyncio
async def test_execute_allowed_command(tmp_path: Path):
    res = await execute_command(["python3", "--version"], str(tmp_path))
    assert res.return_code == 0
    assert "Python 3." in (res.stdout + res.stderr)
    assert not res.timed_out


@pytest.mark.asyncio
async def test_disallowed_command_blocked(tmp_path: Path):
    with pytest.raises(HTTPException) as exc:
        await execute_command(["curl", "http://example.com"], str(tmp_path))
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_command_timeout(tmp_path: Path):
    slow_script = tmp_path / "slow.py"
    slow_script.write_text("import time\ntime.sleep(5)\n")

    res = await execute_command(
        ["python3", "slow.py"],
        str(tmp_path),
        timeout_seconds=1,
    )
    assert res.timed_out is True
    assert "timed out" in res.stderr
