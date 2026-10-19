"""Tests for Test Runner Abstraction and Execution Tracking."""

import json
from pathlib import Path
import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.database import get_db_connection, init_db
from app.main import app
from app.services.test_runner import (
    detect_project_test_commands,
    parse_test_metrics,
    run_approved_test_command,
)


def test_detect_project_test_commands(tmp_path: Path):
    """Detects pytest and npm test commands based on directory contents."""
    # 1. Pytest detection
    (tmp_path / "test_sample.py").write_text("def test_ok(): pass\n", encoding="utf-8")
    detected = detect_project_test_commands(tmp_path)
    assert any(d["framework"] == "pytest" for d in detected)

    # 2. Package.json detection
    pkg = {
        "name": "sample-node",
        "scripts": {
            "test": "vitest run",
            "build": "vite build",
        },
    }
    (tmp_path / "package.json").write_text(json.dumps(pkg), encoding="utf-8")
    detected_all = detect_project_test_commands(tmp_path)
    frameworks = [d["framework"] for d in detected_all]
    assert "pytest" in frameworks
    assert "npm-test" in frameworks
    assert "npm-build" in frameworks


def test_parse_test_metrics():
    """Parses passed, failed, and skipped metrics across pytest, vitest, and cargo test."""
    # Pytest output
    pytest_out = "=== 12 passed, 2 failed, 1 skipped in 1.45s ==="
    metrics = parse_test_metrics(pytest_out)
    assert metrics["passed"] == 12
    assert metrics["failed"] == 2
    assert metrics["skipped"] == 1

    # Jest / Vitest output
    jest_out = "Tests: 2 failed, 8 passed, 10 total"
    metrics_jest = parse_test_metrics(jest_out)
    assert metrics_jest["passed"] == 8
    assert metrics_jest["failed"] == 2

    # Cargo test output
    cargo_out = "test result: ok. 15 passed; 0 failed; 3 ignored"
    metrics_cargo = parse_test_metrics(cargo_out)
    assert metrics_cargo["passed"] == 15
    assert metrics_cargo["failed"] == 0
    assert metrics_cargo["skipped"] == 3


@pytest.mark.asyncio
async def test_run_approved_test_command_and_persistence(tmp_path: Path):
    """Executes an allowed command, parses output, and logs to test_executions."""
    settings.DATA_DIR = tmp_path
    settings.DB_FILENAME = "test_runner.db"
    await init_db()

    ws = tmp_path / "workspace"
    ws.mkdir()

    # Run python3 command (allowlisted test mock)
    res = await run_approved_test_command(
        workspace_root=str(ws),
        command_args=["python3", "-c", "print('=== 3 passed in 0.12s ===')"],
        session_id=None,
    )
    assert res["status"] == "passed"
    assert res["passed"] == 3
    assert res["failed"] == 0

    # Verify recorded in DB
    async with get_db_connection() as db:
        async with db.execute("SELECT * FROM test_executions WHERE id = ?", (res["id"],)) as cursor:
            row = await cursor.fetchone()
            assert row is not None
            assert row["session_id"] is None
            assert row["passed_tests"] == 3


@pytest.mark.asyncio
async def test_commands_api_endpoints(tmp_path: Path):
    """Tests /api/commands/allowed, /detect, and /history endpoints."""
    settings.DATA_DIR = tmp_path
    settings.DB_FILENAME = "test_runner_api.db"
    await init_db()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://127.0.0.1:8000") as client:
        # 1. Allowed commands
        allowed_res = await client.get("/api/commands/allowed")
        assert allowed_res.status_code == 200
        allowed = allowed_res.json()
        assert "pytest" in allowed
        assert "npm" in allowed

        # 2. Detect commands (empty or default workspace)
        detect_res = await client.get("/api/commands/detect")
        assert detect_res.status_code == 200
        assert isinstance(detect_res.json(), list)

        # 3. History
        hist_res = await client.get("/api/commands/history")
        assert hist_res.status_code == 200
        assert isinstance(hist_res.json(), list)
