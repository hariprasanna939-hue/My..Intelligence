import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.config import settings
from app.database import get_setting, set_setting
from app.schemas import (
    BrowseDirectoryResponse,
    DirectoryEntry,
    FileNode,
    FileReadResponse,
    FileSearchMatch,
    FileSearchRequest,
    ProjectSummaryResponse,
    SetWorkspaceRequest,
)
from app.security import validate_workspace_directory
from app.services.project_understanding import (
    build_project_summary,
    inspect_project_manifests,
    list_workspace_files,
    search_code_content,
    search_filenames,
)
from app.services.workspace import (
    build_directory_tree,
    delete_file_safely,
    read_file_safely,
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


@router.get("/recent", response_model=List[str])
async def get_recent_workspaces():
    """Returns the list of recently opened project paths."""
    raw = await get_setting("recent_workspaces", "[]")
    try:
        return json.loads(raw or "[]")
    except Exception:
        return []


@router.get("/browse", response_model=BrowseDirectoryResponse)
async def browse_directory(path: Optional[str] = Query(None, description="Absolute folder path to browse")):
    """Secure backend folder navigation for workspace selection workflow.
    
    Allows user to navigate local directories on their Mac to choose a workspace.
    """
    if path and path.strip():
        target = Path(path).expanduser().resolve()
    else:
        # Default to user home directory
        target = Path.home().resolve()

    if not target.exists():
        raise HTTPException(status_code=404, detail=f"Directory not found: {path}")
    if not target.is_dir():
        raise HTTPException(status_code=400, detail=f"Path is not a directory: {path}")

    parent_path = str(target.parent) if target.parent != target else None
    entries: List[DirectoryEntry] = []

    try:
        for item in sorted(target.iterdir(), key=lambda p: p.name.lower()):
            if item.is_dir() and not item.name.startswith("."):
                entries.append(DirectoryEntry(name=item.name, path=str(item), is_accessible=True))
    except PermissionError:
        pass

    return BrowseDirectoryResponse(
        current_path=str(target),
        parent_path=parent_path,
        directories=entries,
        is_valid_workspace=target.is_dir(),
    )


@router.post("")
async def set_active_workspace(req: SetWorkspaceRequest):
    """Sets and validates the active workspace directory path, saving to recent history."""
    resolved_dir = validate_workspace_directory(req.workspace_path)
    workspace_str = str(resolved_dir)
    await set_setting("active_workspace", workspace_str)
    settings.ACTIVE_WORKSPACE = workspace_str

    # Update recent workspaces list
    raw = await get_setting("recent_workspaces", "[]")
    try:
        recents: List[str] = json.loads(raw or "[]")
    except Exception:
        recents = []
    
    if workspace_str in recents:
        recents.remove(workspace_str)
    recents.insert(0, workspace_str)
    recents = recents[:10]  # keep top 10
    await set_setting("recent_workspaces", json.dumps(recents))

    return {
        "status": "success",
        "active_workspace": workspace_str,
        "recent_workspaces": recents,
    }


@router.get("/tree", response_model=FileNode)
async def get_workspace_tree():
    """Returns the directory hierarchy tree of the active workspace."""
    workspace = await _get_current_workspace()
    root_path = Path(workspace)
    return build_directory_tree(root_path, root_path)


@router.get("/summary", response_model=ProjectSummaryResponse)
async def get_project_summary_endpoint():
    """Builds a concise, truthful project summary from actual files."""
    workspace = await _get_current_workspace()
    return build_project_summary(workspace)


@router.get("/manifests")
async def get_project_manifests_endpoint():
    """Inspects package manifests (package.json, pyproject.toml, etc.) in the workspace."""
    workspace = await _get_current_workspace()
    return inspect_project_manifests(workspace)


@router.get("/files")
async def get_workspace_files_endpoint(
    max_depth: int = Query(5, ge=1, le=10),
    max_files: int = Query(500, ge=1, le=2000),
):
    """Lists non-ignored files with metadata (size, language, format)."""
    workspace = await _get_current_workspace()
    return list_workspace_files(workspace, max_depth=max_depth, max_files=max_files)


@router.get("/search-filenames")
async def search_filenames_endpoint(pattern: str = Query(..., min_length=1)):
    """Searches filenames within active workspace matching pattern."""
    workspace = await _get_current_workspace()
    return search_filenames(workspace, pattern)


@router.get("/file", response_model=FileReadResponse)
async def get_file_content(
    path: str = Query(..., description="Relative path within workspace"),
    start_line: Optional[int] = Query(None, ge=1, description="1-indexed starting line"),
    end_line: Optional[int] = Query(None, ge=1, description="1-indexed ending line"),
):
    """Reads a file safely from within the active workspace with optional line range."""
    workspace = await _get_current_workspace()
    return read_file_safely(workspace, path, start_line=start_line, end_line=end_line)


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
    """Searches plain text across non-binary files in the workspace with optional extensions."""
    workspace = await _get_current_workspace()
    return search_code_content(
        workspace,
        query=req.query,
        file_extensions=req.file_extensions,
        max_results=req.max_results,
    )
