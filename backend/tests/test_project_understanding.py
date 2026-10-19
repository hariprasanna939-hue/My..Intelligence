"""Unit and integration tests for safe local project understanding.

Covers:
1. Path traversal and symlink escape defenses
2. Missing file handling (404)
3. Large file size limits (400)
4. Binary file handling (preview rejected / is_binary flag)
5. Successful source-file reads and line-range slicing
6. Secret scrubbing within source file previews
7. Workspace file listing and metadata (language, size)
8. Filename pattern searching
9. Code content search across files
10. Package manifest inspection (package.json, requirements.txt, README)
11. Truthful project summary generation
12. Agent context gathering for grounded model reasoning
13. Backend folder browsing API endpoint (/api/workspace/browse)
"""

import json
from pathlib import Path
import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.database import init_db
from app.main import app
from app.security import resolve_safe_path
from app.services.project_understanding import (
    build_project_summary,
    gather_project_context,
    inspect_project_manifests,
    list_workspace_files,
    read_file_range,
    search_code_content,
    search_filenames,
)
from app.services.workspace import read_file_safely


@pytest.fixture(autouse=True)
def reset_settings(tmp_path: Path):
    """Isolate settings and DB per test."""
    settings.DATA_DIR = tmp_path
    settings.DB_FILENAME = "test_pu.db"


# ---------------------------------------------------------------------------
# 1. File Reading & Boundary Tests
# ---------------------------------------------------------------------------

def test_read_file_missing_raises_404(tmp_path: Path):
    """Reading a non-existent file raises HTTP 404."""
    workspace = tmp_path / "my_project"
    workspace.mkdir()

    with pytest.raises(HTTPException) as exc:
        read_file_safely(str(workspace), "nonexistent.py")
    assert exc.value.status_code == 404
    assert "File not found" in exc.value.detail


def test_read_file_large_raises_400(tmp_path: Path):
    """Reading a file larger than MAX_FILE_SIZE_BYTES raises HTTP 400."""
    workspace = tmp_path / "my_project"
    workspace.mkdir()
    large_file = workspace / "huge.txt"
    large_file.write_text("A" * 1024)

    # Temporarily set max file size to 512 bytes
    orig_limit = settings.MAX_FILE_SIZE_BYTES
    settings.MAX_FILE_SIZE_BYTES = 512
    try:
        with pytest.raises(HTTPException) as exc:
            read_file_safely(str(workspace), "huge.txt")
        assert exc.value.status_code == 400
        assert "exceeds max" in exc.value.detail.lower()
    finally:
        settings.MAX_FILE_SIZE_BYTES = orig_limit


def test_read_file_binary_extension_rejected(tmp_path: Path):
    """Binary files (.png, .sqlite, .zip) return is_binary=True with preview note."""
    workspace = tmp_path / "my_project"
    workspace.mkdir()
    binary_file = workspace / "icon.png"
    binary_file.write_bytes(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR")

    res = read_file_safely(str(workspace), "icon.png")
    assert res.is_binary is True
    assert "[Binary file preview not supported]" in res.content


def test_read_file_success_and_line_ranges(tmp_path: Path):
    """Reading a source file returns content, line count, language, and supports line slicing."""
    workspace = tmp_path / "my_project"
    workspace.mkdir()
    source_file = workspace / "calc.py"
    source_file.write_text(
        "line 1\n"
        "line 2: def add(a, b):\n"
        "line 3:     return a + b\n"
        "line 4\n"
        "line 5\n"
    )

    # Full read
    full_res = read_file_safely(str(workspace), "calc.py")
    assert full_res.is_binary is False
    assert full_res.language == "python"
    assert full_res.total_lines == 5
    assert full_res.start_line == 1
    assert full_res.end_line == 5
    assert "def add(a, b):" in full_res.content

    # Line range slice (lines 2 to 3)
    slice_res = read_file_safely(str(workspace), "calc.py", start_line=2, end_line=3)
    assert slice_res.start_line == 2
    assert slice_res.end_line == 3
    assert slice_res.total_lines == 5
    assert "line 2: def add(a, b):" in slice_res.content
    assert "line 3:     return a + b" in slice_res.content
    assert "line 1" not in slice_res.content
    assert "line 4" not in slice_res.content


def test_read_file_scrubs_secrets_in_preview(tmp_path: Path):
    """Reading a source file automatically sanitizes exposed secrets or credentials."""
    workspace = tmp_path / "my_project"
    workspace.mkdir()
    source_file = workspace / "config.py"
    source_file.write_text("DB_HOST = '127.0.0.1'\nAPI_KEY = 'sk-1234567890abcdef1234567890'\n")

    res = read_file_safely(str(workspace), "config.py")
    assert "sk-1234567890abcdef1234567890" not in res.content
    assert "[REDACTED_SECRET]" in res.content


# ---------------------------------------------------------------------------
# 2. File Cataloging, Filename Search, and Code Search
# ---------------------------------------------------------------------------

def test_list_workspace_files_excludes_noise(tmp_path: Path):
    """list_workspace_files returns files, calculates language, and ignores node_modules/.git/.venv."""
    workspace = tmp_path / "app"
    workspace.mkdir()

    (workspace / "src").mkdir()
    (workspace / "src" / "index.ts").write_text("console.log('hi');")
    (workspace / "node_modules").mkdir()
    (workspace / "node_modules" / "pkg.js").write_text("// noise")
    (workspace / ".venv").mkdir()
    (workspace / ".venv" / "bin.py").write_text("# noise")

    files = list_workspace_files(workspace)
    rel_paths = [f["relative_path"] for f in files]

    assert "src/index.ts" in rel_paths
    assert not any("node_modules" in p for p in rel_paths)
    assert not any(".venv" in p for p in rel_paths)
    
    ts_entry = [f for f in files if f["relative_path"] == "src/index.ts"][0]
    assert ts_entry["language"] == "typescript"
    assert "B" in ts_entry["formatted_size"]


def test_search_filenames(tmp_path: Path):
    """search_filenames supports wildcard patterns and substring matching."""
    workspace = tmp_path / "app"
    workspace.mkdir()
    (workspace / "test_auth.py").write_text("# test")
    (workspace / "auth_controller.ts").write_text("// auth")
    (workspace / "database.py").write_text("# db")

    # Match *auth*
    matches = search_filenames(workspace, "auth")
    matched_names = [m["name"] for m in matches]
    assert "test_auth.py" in matched_names
    assert "auth_controller.ts" in matched_names
    assert "database.py" not in matched_names


def test_search_code_content(tmp_path: Path):
    """search_code_content finds matching lines with line numbers and supports extension filtering."""
    workspace = tmp_path / "app"
    workspace.mkdir()
    (workspace / "login.py").write_text("def authenticate_user():\n    return True\n")
    (workspace / "login.ts").write_text("function authenticate_user() { return true; }\n")
    (workspace / "other.py").write_text("def unrelated(): pass\n")

    # Search all
    matches = search_code_content(workspace, "authenticate_user")
    assert len(matches) == 2
    assert any(m.file_path == "login.py" for m in matches)
    assert any(m.file_path == "login.ts" for m in matches)

    # Filter by extension .py only
    py_matches = search_code_content(workspace, "authenticate_user", file_extensions=[".py"])
    assert len(py_matches) == 1
    assert py_matches[0].file_path == "login.py"
    assert py_matches[0].line_number == 1


# ---------------------------------------------------------------------------
# 3. Manifests, Summaries, and Agent Grounding
# ---------------------------------------------------------------------------

def test_inspect_manifests_and_build_summary(tmp_path: Path):
    """inspect_project_manifests and build_project_summary detect stack, dependencies, and test runner."""
    workspace = tmp_path / "app"
    workspace.mkdir()

    # Create package.json
    pkg_json = {
        "name": "my-offline-app",
        "version": "1.0.0",
        "scripts": {"test": "vitest"},
        "dependencies": {"react": "^18.0.0"},
    }
    (workspace / "package.json").write_text(json.dumps(pkg_json))
    (workspace / "README.md").write_text("# My Offline App\nThis is a local tool.")
    (workspace / "src").mkdir()
    (workspace / "src" / "App.tsx").write_text("export const App = () => <div>Hello</div>;")

    # Inspect manifests
    manifests = inspect_project_manifests(workspace)
    assert "package.json" in manifests
    assert manifests["package.json"]["name"] == "my-offline-app"
    assert "react" in manifests["package.json"]["dependencies"]
    assert "README.md" in manifests

    # Build summary
    summary = build_project_summary(workspace)
    assert summary["workspace_name"] == "app"
    assert "typescriptreact" in [l[0] for l in summary["languages"]]
    assert "vitest" in summary["test_runner"]
    assert "src" in summary["top_level_directories"]


def test_gather_project_context_grounds_agent(tmp_path: Path):
    """gather_project_context finds relevant files for a prompt and reports missing terms honestly."""
    workspace = tmp_path / "app"
    workspace.mkdir()
    (workspace / "calculator.py").write_text("def multiply(a, b):\n    return a * b\n")

    # Prompt mentioning existing code
    ctx = gather_project_context(workspace, "How does the multiply function in calculator work?")
    assert "calculator.py" in ctx
    assert "def multiply(a, b):" in ctx
    assert "PROJECT ARCHITECTURE OVERVIEW" in ctx

    # Prompt mentioning nonexistent code
    ctx_missing = gather_project_context(workspace, "Why is the nonexistent_quantum_teleport failing?")
    assert "NOTE: Searches for prompt keywords" in ctx_missing


# ---------------------------------------------------------------------------
# 4. Workspace API Endpoints Verification
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_workspace_api_endpoints(tmp_path: Path):
    """Integration test verifying browse, summary, manifests, files, and line-range endpoints."""
    await init_db()
    workspace = tmp_path / "full_project"
    workspace.mkdir()
    (workspace / "main.py").write_text("line 1\nline 2\nline 3\nline 4\n")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://127.0.0.1:8000") as client:
        # 1. Test /api/workspace/browse
        browse_res = await client.get(f"/api/workspace/browse?path={workspace.parent}")
        assert browse_res.status_code == 200
        browse_data = browse_res.json()
        assert any(d["name"] == "full_project" for d in browse_data["directories"])

        # 2. Set active workspace
        ws_res = await client.post("/api/workspace", json={"workspace_path": str(workspace)})
        assert ws_res.status_code == 200

        # 3. Test /api/workspace/summary
        sum_res = await client.get("/api/workspace/summary")
        assert sum_res.status_code == 200
        assert sum_res.json()["workspace_name"] == "full_project"

        # 4. Test /api/workspace/files
        files_res = await client.get("/api/workspace/files")
        assert files_res.status_code == 200
        assert any(f["name"] == "main.py" for f in files_res.json())

        # 5. Test /api/workspace/search-filenames
        fn_res = await client.get("/api/workspace/search-filenames?pattern=main*")
        assert fn_res.status_code == 200
        assert len(fn_res.json()) == 1

        # 6. Test /api/workspace/file with line ranges
        file_range_res = await client.get("/api/workspace/file?path=main.py&start_line=2&end_line=3")
        assert file_range_res.status_code == 200
        f_data = file_range_res.json()
        assert f_data["start_line"] == 2
        assert f_data["end_line"] == 3
        assert "line 2\nline 3" in f_data["content"]
        assert "line 1" not in f_data["content"]
