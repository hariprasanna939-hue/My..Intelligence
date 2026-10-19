"""Unit tests for ForgeLocal security, sandboxing, and secret scrubbing."""

from pathlib import Path
import pytest
from fastapi import HTTPException

from app.security import (
    is_sensitive_path,
    resolve_safe_path,
    sanitize_text,
    validate_command,
    validate_workspace_directory,
)


def test_sanitize_text_redacts_credentials():
    sample = "My api_key = 'abcdef123456789' and password: 'supersecretpassword'"
    cleaned = sanitize_text(sample)
    assert "abcdef123456789" not in cleaned
    assert "supersecretpassword" not in cleaned
    assert "[REDACTED_SECRET]" in cleaned


def test_is_sensitive_path():
    assert is_sensitive_path(".env") is True
    assert is_sensitive_path("config/.env.local") is True
    assert is_sensitive_path("id_rsa") is True
    assert is_sensitive_path("server.key") is True
    assert is_sensitive_path("main.py") is False
    assert is_sensitive_path("src/components/Header.tsx") is False


def test_validate_workspace_directory(tmp_path: Path):
    # Valid folder
    valid = validate_workspace_directory(str(tmp_path))
    assert valid == tmp_path.resolve()

    # Non-existent folder
    with pytest.raises(HTTPException) as exc:
        validate_workspace_directory(str(tmp_path / "does_not_exist"))
    assert exc.value.status_code == 404

    # Empty path
    with pytest.raises(HTTPException) as exc:
        validate_workspace_directory("")
    assert exc.value.status_code == 400


def test_resolve_safe_path_blocks_path_traversal(tmp_path: Path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (workspace / "valid.txt").write_text("hello")

    outside = tmp_path / "outside.txt"
    outside.write_text("secret outside")

    # Safe access
    resolved = resolve_safe_path(workspace, "valid.txt")
    assert resolved == (workspace / "valid.txt").resolve()

    # Traversal attack
    with pytest.raises(HTTPException) as exc:
        resolve_safe_path(workspace, "../outside.txt")
    assert exc.value.status_code == 403
    assert "Path traversal outside workspace boundary" in exc.value.detail


def test_resolve_safe_path_blocks_symlink_escape(tmp_path: Path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    outside_file = tmp_path / "outside_secret.txt"
    outside_file.write_text("classified data")

    # Create symlink pointing outside workspace
    escaped_symlink = workspace / "escaped_link"
    escaped_symlink.symlink_to(outside_file)

    with pytest.raises(HTTPException) as exc:
        resolve_safe_path(workspace, "escaped_link")
    assert exc.value.status_code == 403
    assert "Path traversal outside workspace boundary" in exc.value.detail


def test_resolve_safe_path_blocks_sensitive_files(tmp_path: Path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (workspace / ".env").write_text("SECRET=123")

    with pytest.raises(HTTPException) as exc:
        resolve_safe_path(workspace, ".env")
    assert exc.value.status_code == 403
    assert "matches a protected sensitive file pattern" in exc.value.detail


def test_validate_command_allowlist():
    # Allowed command
    bin_name, args = validate_command(["pytest", "-v", "tests/"])
    assert bin_name == "pytest"
    assert args == ["-v", "tests/"]

    # Python execution
    bin_name, args = validate_command(["python3", "-m", "unittest"])
    assert bin_name == "python3"

    # Disallowed binary
    with pytest.raises(HTTPException) as exc:
        validate_command(["rm", "-rf", "/"])
    assert exc.value.status_code == 403

    # Shell injection metacharacters inside args
    with pytest.raises(HTTPException) as exc:
        validate_command(["pytest", "test.py; rm -rf /"])
    assert exc.value.status_code == 400
    assert "prohibited shell metacharacter" in exc.value.detail
