"""Workspace and Filesystem operations service.

Safely handles directory tree generation, file reading/writing,
diff computation, and file searches restricted to the active workspace.
"""

import difflib
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import HTTPException

from app.config import settings
from app.schemas import FileNode, FileReadResponse, FileSearchMatch
from app.security import resolve_safe_path, validate_workspace_directory


# Directory names to skip when scanning workspace tree
EXCLUDED_DIRS = {
    ".git",
    "node_modules",
    "__pycache__",
    ".pytest_cache",
    ".venv",
    "venv",
    ".idea",
    ".vscode",
    "dist",
    "build",
    ".next",
    ".npm-cache",
}

# Binary extensions to avoid attempting text decode
BINARY_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".pdf",
    ".zip", ".tar", ".gz", ".7z", ".exe", ".bin", ".dylib",
    ".so", ".pyc", ".db", ".sqlite", ".sqlite3", ".parquet",
}


def build_directory_tree(
    current_path: Path, 
    workspace_root: Path, 
    depth: int = 0, 
    max_depth: int = 6
) -> FileNode:
    """Recursively builds a tree of files and directories within workspace."""
    from app.services.project_understanding import detect_language, format_file_size

    rel_path = str(current_path.relative_to(workspace_root))
    if rel_path == ".":
        rel_path = ""

    is_file = current_path.is_file()
    size = current_path.stat().st_size if is_file else None

    node = FileNode(
        name=current_path.name if current_path != workspace_root else workspace_root.name,
        path=rel_path,
        is_dir=current_path.is_dir(),
        size=size,
        language=detect_language(current_path) if is_file else None,
        formatted_size=format_file_size(size) if size is not None else None,
        children=None,
    )

    if current_path.is_dir() and depth < max_depth:
        children = []
        try:
            # Sort items: directories first (alphabetical), then files (alphabetical)
            items = sorted(
                list(current_path.iterdir()), 
                key=lambda p: (not p.is_dir(), p.name.lower())
            )
            for item in items:
                # Skip hidden/excluded directories and common build artifacts
                if item.name in EXCLUDED_DIRS or (item.name.startswith(".") and item.is_dir()):
                    continue
                children.append(
                    build_directory_tree(item, workspace_root, depth + 1, max_depth)
                )
            node.children = children
        except PermissionError:
            node.children = []

    return node


def read_file_safely(
    workspace_root: str,
    relative_path: str,
    start_line: Optional[int] = None,
    end_line: Optional[int] = None,
) -> FileReadResponse:
    """Reads a file within the workspace safely, with secret scrubbing and optional line ranges."""
    from app.services.project_understanding import read_file_range

    data = read_file_range(workspace_root, relative_path, start_line=start_line, end_line=end_line)
    return FileReadResponse(
        path=data["path"],
        relative_path=data["relative_path"],
        content=data["content"],
        size=data["size"],
        is_binary=data["is_binary"],
        language=data.get("language", "plaintext"),
        formatted_size=data.get("formatted_size"),
        total_lines=data.get("total_lines"),
        start_line=data.get("start_line", 1),
        end_line=data.get("end_line"),
    )


def write_file_safely(workspace_root: str, relative_path: str, content: str) -> None:
    """Writes or overwrites a file within the workspace safely, creating parent folders if needed."""
    target_path = resolve_safe_path(workspace_root, relative_path)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_text(content, encoding="utf-8")


def delete_file_safely(workspace_root: str, relative_path: str) -> None:
    """Deletes a file within the workspace safely."""
    target_path = resolve_safe_path(workspace_root, relative_path)
    if not target_path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {relative_path}")
    if target_path.is_file():
        target_path.unlink()
    else:
        raise HTTPException(status_code=400, detail="Cannot delete directory via single file delete.")


def generate_unified_diff(
    original_text: str, 
    new_text: str, 
    filename: str = "file"
) -> str:
    """Generates standard unified diff format for visual change reviews."""
    original_lines = original_text.splitlines(keepends=True)
    new_lines = new_text.splitlines(keepends=True)

    diff = difflib.unified_diff(
        original_lines,
        new_lines,
        fromfile=f"a/{filename}",
        tofile=f"b/{filename}",
        lineterm="",
    )
    return "".join(diff)


def search_in_workspace(
    workspace_root: str, 
    query: str, 
    max_results: int = 50
) -> List[FileSearchMatch]:
    """Searches plain text case-insensitively across non-binary files in the workspace."""
    root_path = validate_workspace_directory(workspace_root)
    matches: List[FileSearchMatch] = []
    query_lower = query.lower()

    for path in root_path.rglob("*"):
        if len(matches) >= max_results:
            break
        if not path.is_file():
            continue
        
        # Check if parent is excluded
        if any(part in EXCLUDED_DIRS for part in path.parts):
            continue
        if path.suffix.lower() in BINARY_EXTENSIONS:
            continue
            
        try:
            rel_str = str(path.relative_to(root_path))
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                for line_no, line in enumerate(f, start=1):
                    if query_lower in line.lower():
                        matches.append(
                            FileSearchMatch(
                                file_path=rel_str,
                                line_number=line_no,
                                line_content=line.strip()[:200],
                            )
                        )
                        if len(matches) >= max_results:
                            break
        except Exception:
            continue

    return matches
