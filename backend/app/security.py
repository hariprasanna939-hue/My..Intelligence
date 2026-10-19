"""Security and Sandboxing Module for ForgeLocal.

Enforces:
1. Strict workspace boundary checking (path traversal & symlink escape prevention)
2. Sensitive file access blocking (e.g. .env, ssh keys, certificates)
3. Command allowlist enforcement (preventing arbitrary shell execution)
4. Secret redactor for logs and chat outputs
"""

import fnmatch
from pathlib import Path
import re
from typing import List, Tuple
from fastapi import HTTPException

from app.config import settings


# Regular expressions for scrubbing potential secrets from logs or messages
SECRET_PATTERNS = [
    re.compile(r"(?i)(api[_-]?key|secret|password|auth[_-]?token|bearer)\s*[:=]\s*['\"]?([a-zA-Z0-9_\-\.]{8,})['\"]?"),
    re.compile(r"-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]+?-----END [A-Z ]+ PRIVATE KEY-----"),
    re.compile(r"ghp_[a-zA-Z0-9]{36}"),
    re.compile(r"xox[baprs]-[0-9a-zA-Z]{10,48}"),
]


def sanitize_text(text: str) -> str:
    """Masks secret patterns and credentials in text before logging or storing."""
    if not text:
        return ""
    sanitized = text
    for pattern in SECRET_PATTERNS:
        sanitized = pattern.sub("[REDACTED_SECRET]", sanitized)
    return sanitized


def validate_workspace_directory(workspace_path: str) -> Path:
    """Validates that a workspace path exists, is a directory, and is accessible.
    
    Returns the resolved Path object.
    """
    if not workspace_path or not workspace_path.strip():
        raise HTTPException(status_code=400, detail="Workspace path cannot be empty.")
    
    path = Path(workspace_path).expanduser().resolve()
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Workspace path does not exist: {workspace_path}")
    if not path.is_dir():
        raise HTTPException(status_code=400, detail=f"Workspace path is not a directory: {workspace_path}")
        
    return path


def is_sensitive_path(relative_or_name: str) -> bool:
    """Checks if a path or filename matches blocked sensitive patterns (.env, keys, etc.)."""
    parts = Path(relative_or_name).parts
    for part in parts:
        for pattern in settings.BLOCKED_FILE_PATTERNS:
            if fnmatch.fnmatch(part.lower(), pattern.lower()):
                return True
    return False


def resolve_safe_path(workspace_root: str | Path, relative_path: str) -> Path:
    """Resolves a relative path within the workspace root safely.

    Guarantees:
    - Path must stay strictly within the workspace directory.
    - Symlink targets outside workspace are rejected.
    - Path traversal attacks (../..) are rejected.
    - Blocked sensitive files (.env, keys) raise 403 Forbidden.
    """
    if not workspace_root:
        raise HTTPException(status_code=400, detail="No active workspace configured.")
    
    root_resolved = Path(workspace_root).expanduser().resolve()
    if not root_resolved.exists() or not root_resolved.is_dir():
        raise HTTPException(status_code=400, detail="Configured workspace is not a valid directory.")

    # Clean the relative path: strip leading slashes and whitespace
    clean_rel = relative_path.strip().lstrip("/\\")
    
    # Check for direct sensitive patterns in the relative path
    if is_sensitive_path(clean_rel):
        raise HTTPException(
            status_code=403, 
            detail=f"Access denied: '{clean_rel}' matches a protected sensitive file pattern."
        )

    # Compute target path
    target = (root_resolved / clean_rel).resolve()

    # Enforce containment within workspace root
    try:
        # Python 3.9+ is_relative_to
        if not target.is_relative_to(root_resolved):
            raise HTTPException(
                status_code=403, 
                detail="Security violation: Path traversal outside workspace boundary is blocked."
            )
    except AttributeError:
        # Fallback for older python if needed
        try:
            target.relative_to(root_resolved)
        except ValueError:
            raise HTTPException(
                status_code=403, 
                detail="Security violation: Path traversal outside workspace boundary is blocked."
            )

    return target


def validate_command(command_args: List[str]) -> Tuple[str, List[str]]:
    """Validates a command against the explicit allowlist.
    
    Prevents shell injection by ensuring commands are executed as discrete argument vectors,
    not via shell=True string interpolation.
    """
    if not command_args:
        raise HTTPException(status_code=400, detail="Command arguments cannot be empty.")
        
    binary = command_args[0].strip()
    
    # Extract basename in case a path was passed like /usr/bin/pytest or ./venv/bin/pytest
    binary_name = Path(binary).name.lower()
    
    # Strip common file extensions if on Windows (.exe, .cmd)
    if binary_name.endswith((".exe", ".cmd", ".bat")):
        binary_name = binary_name.rsplit(".", 1)[0]

    allowed_list = [c.lower() for c in settings.ALLOWED_COMMANDS]
    
    if binary_name not in allowed_list:
        raise HTTPException(
            status_code=403,
            detail=f"Command '{binary_name}' is not in the allowed list: {settings.ALLOWED_COMMANDS}"
        )
        
    # Check for shell metacharacters that might be passed inside arguments
    dangerous_chars = [";", "|", "&", "`", "$", "\n", "\r", "<", ">"]
    for arg in command_args:
        for char in dangerous_chars:
            if char in arg:
                raise HTTPException(
                    status_code=400,
                    detail=f"Command argument contains prohibited shell metacharacter '{char}'."
                )

    return binary, command_args[1:]
