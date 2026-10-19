"""Controlled command execution router."""

from typing import List
from fastapi import APIRouter, HTTPException

from app.config import settings
from app.database import get_setting
from app.schemas import CommandExecutionRequest, CommandExecutionResponse
from app.services.command_runner import execute_command

router = APIRouter(prefix="/api/commands", tags=["commands"])


@router.get("/allowed", response_model=List[str])
async def get_allowed_commands():
    """Returns the list of allowlisted command binaries."""
    return settings.ALLOWED_COMMANDS


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
