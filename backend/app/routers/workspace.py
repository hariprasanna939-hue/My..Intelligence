"""Workspace filesystem operations router."""

from pathlib import Path
from typing import Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.config import settings
from app.database import get_setting, set_setting
from app.schemas import (
    FileNode,
    FileReadResponse,
    FileSearchMatch,
    FileSearchRequest,
    SetWorkspaceRequest,
)
from app.security import validate_workspace_directory
from app.services.workspace import (
    build_directory_tree,
    delete_file_safely,
    read_file_safely,
    search_in_workspace,
    write_file_safely,
)

router = APIRouter(prefix="/api/workspace", tags=["workspace"])


class CreateFileRequest(BaseModel):
    path: str
    content: str = ""


async def _get_current_workspace() -> str:
    """Helper to retrieve active workspace or raise 400 if unset."""
    workspace = await get_setting("active_workspace", settings.ACTIVE_WORKSPACE)
    if not workspace:
        raise HTTPException(
            status_code=400,
            detail="No workspace is currently selected. Please set a workspace first.",
        )
    return workspace


@router.get("")
async def get_active_workspace():
    """Gets the currently selected workspace directory path."""
    workspace = await get_setting("active_workspace", settings.ACTIVE_WORKSPACE)
    return {"active_workspace": workspace}


@router.post("")
async def set_active_workspace(req: SetWorkspaceRequest):
    """Sets and validates the active workspace directory path."""
    resolved_dir = validate_workspace_directory(req.workspace_path)
    workspace_str = str(resolved_dir)
    await set_setting("active_workspace", workspace_str)
    settings.ACTIVE_WORKSPACE = workspace_str
    return {
        "status": "success",
        "active_workspace": workspace_str,
    }


@router.get("/tree", response_model=FileNode)
async def get_workspace_tree():
    """Returns the directory hierarchy tree of the active workspace."""
    workspace = await _get_current_workspace()
    root_path = Path(workspace)
    return build_directory_tree(root_path, root_path)


@router.get("/file", response_model=FileReadResponse)
async def get_file_content(path: str = Query(..., description="Relative path within workspace")):
    """Reads a file safely from within the active workspace."""
    workspace = await _get_current_workspace()
    return read_file_safely(workspace, path)


@router.post("/file")
async def save_file(req: CreateFileRequest):
    """Creates or updates a file directly in the active workspace."""
    workspace = await _get_current_workspace()
    write_file_safely(workspace, req.path, req.content)
    return {"status": "success", "path": req.path}


@router.delete("/file")
async def delete_file(path: str = Query(..., description="Relative path within workspace")):
    """Deletes a file safely from within the active workspace."""
    workspace = await _get_current_workspace()
    delete_file_safely(workspace, path)
    return {"status": "success", "deleted": path}


@router.post("/search", response_model=List[FileSearchMatch])
async def search_workspace(req: FileSearchRequest):
    """Searches plain text across non-binary files in the workspace."""
    workspace = await _get_current_workspace()
    return search_in_workspace(workspace, req.query, req.max_results)
