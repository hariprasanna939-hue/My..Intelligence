"""Controlled command execution router."""

from typing import Any, Dict, List
from fastapi import APIRouter, HTTPException

from app.config import settings
from app.database import get_db_connection, get_setting
from app.schemas import CommandExecutionRequest, CommandExecutionResponse
from app.services.command_runner import execute_command
from app.services.test_runner import detect_project_test_commands

router = APIRouter(prefix="/api/commands", tags=["commands"])


@router.get("/allowed", response_model=List[str])
async def get_allowed_commands():
    """Returns the list of allowlisted command binaries."""
    return settings.ALLOWED_COMMANDS


@router.get("/detect")
async def detect_test_commands():
    """Detects available test and build commands based on workspace manifests."""
    workspace = await get_setting("active_workspace", settings.ACTIVE_WORKSPACE)
    if not workspace:
        return []
    try:
        return detect_project_test_commands(workspace)
    except Exception:
        return []


@router.get("/history")
async def get_test_execution_history(limit: int = 20):
    """Retrieves recent test executions from SQLite."""
    executions = []
    async with get_db_connection() as db:
        async with db.execute("""
            SELECT id, session_id, command, working_dir, return_code,
                   passed_tests, failed_tests, skipped_tests,
                   stdout, stderr, execution_time_ms, timed_out, created_at
            FROM test_executions
            ORDER BY created_at DESC LIMIT ?
        """, (limit,)) as cursor:
            rows = await cursor.fetchall()
            for r in rows:
                executions.append(dict(r))
    return executions


@router.post("/run", response_model=CommandExecutionResponse)
async def run_controlled_command(req: CommandExecutionRequest):
    """Executes a command within the active workspace if in the allowlist."""
    workspace = await get_setting("active_workspace", settings.ACTIVE_WORKSPACE)
    if not workspace:
        raise HTTPException(
            status_code=400,
            detail="Cannot run command without an active workspace selected.",
        )

    return await execute_command(req.command_args, workspace)

