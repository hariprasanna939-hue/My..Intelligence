"""Safe Test Runner Abstraction for ForgeLocal.

Inspects project configuration to detect supported test commands,
enforces allowlist validation, executes tests with timeouts and working directory containment,
parses passed/failed/skipped metrics, and logs execution to SQLite.
"""

from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import re
from typing import Any, Dict, List, Optional
import uuid

from app.database import get_db_connection, save_test_execution_record
from app.schemas import CommandExecutionResponse
from app.security import validate_command, validate_workspace_directory
from app.services.command_runner import execute_command
from app.services.project_understanding import inspect_project_manifests

logger = logging.getLogger("forgelocal.test_runner")


def detect_project_test_commands(workspace_root: str | Path) -> List[Dict[str, Any]]:
    """Detects available test and build commands based on actual project manifests and files."""
    root = validate_workspace_directory(str(workspace_root))
    detected: List[Dict[str, Any]] = []

    # 1. Python / Pytest
    has_py = any(root.glob("test_*.py")) or any(root.glob("*_test.py")) or (root / "tests").exists() or (root / "pytest.ini").exists()
    if has_py:
        detected.append({
            "framework": "pytest",
            "command": ["pytest", "-v"],
            "command_str": "pytest -v",
            "description": "Python Pytest Test Suite",
            "is_default": True,
        })

    # 2. Node / NPM
    pkg_path = root / "package.json"
    if pkg_path.exists():
        try:
            pkg_data = json.loads(pkg_path.read_text(encoding="utf-8"))
            scripts = pkg_data.get("scripts", {})
            if "test" in scripts:
                detected.append({
                    "framework": "npm-test",
                    "command": ["npm", "test"],
                    "command_str": "npm test",
                    "description": f"NPM Test ({scripts['test']})",
                    "is_default": len(detected) == 0,
                })
            if "build" in scripts:
                detected.append({
                    "framework": "npm-build",
                    "command": ["npm", "run", "build"],
                    "command_str": "npm run build",
                    "description": f"NPM Build ({scripts['build']})",
                    "is_default": False,
                })
        except Exception:
            pass

    # 3. Rust / Cargo
    if (root / "Cargo.toml").exists():
        detected.append({
            "framework": "cargo",
            "command": ["cargo", "test"],
            "command_str": "cargo test",
            "description": "Cargo Test Suite",
            "is_default": len(detected) == 0,
        })

    # 4. Go
    if (root / "go.mod").exists():
        detected.append({
            "framework": "go",
            "command": ["go", "test", "./..."],
            "command_str": "go test ./...",
            "description": "Go Test Suite",
            "is_default": len(detected) == 0,
        })

    return detected


def parse_test_metrics(output: str) -> Dict[str, int]:
    """Parses passed, failed, and skipped test counts from command output."""
    passed = 0
    failed = 0
    skipped = 0

    # Cargo test format: "test result: ok. 4 passed; 0 failed; 0 ignored"
    cargo_match = re.search(r"(\d+)\s+passed;\s*(\d+)\s+failed;\s*(\d+)\s+ignored", output, re.IGNORECASE)
    if cargo_match:
        return {
            "passed": int(cargo_match.group(1)),
            "failed": int(cargo_match.group(2)),
            "skipped": int(cargo_match.group(3)),
        }

    # Pytest format: "== 5 passed, 1 failed, 2 skipped in 0.23s =="
    pytest_passed = re.search(r"(\d+)\s+passed", output, re.IGNORECASE)
    if pytest_passed:
        passed = int(pytest_passed.group(1))

    pytest_failed = re.search(r"(\d+)\s+failed", output, re.IGNORECASE)
    if pytest_failed:
        failed = int(pytest_failed.group(1))

    pytest_skipped = re.search(r"(\d+)\s+skipped", output, re.IGNORECASE)
    if pytest_skipped:
        skipped = int(pytest_skipped.group(1))

    # Jest / Vitest format: "Tests: 1 failed, 4 passed, 5 total"
    if not passed and not failed:
        jest_passed = re.search(r"(\d+)\s+passed,\s+\d+\s+total", output, re.IGNORECASE)
        if jest_passed:
            passed = int(jest_passed.group(1))
        jest_failed = re.search(r"(\d+)\s+failed", output, re.IGNORECASE)
        if jest_failed:
            failed = int(jest_failed.group(1))

    return {
        "passed": passed,
        "failed": failed,
        "skipped": skipped,
    }


async def run_approved_test_command(
    workspace_root: str,
    command_args: List[str],
    session_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Executes an approved test command, parses metrics, and records details in SQLite."""
    # Validate against security allowlist
    validate_command(command_args)

    exec_res: CommandExecutionResponse = await execute_command(
        command_args=command_args,
        workspace_root=workspace_root,
    )

    combined_output = f"{exec_res.stdout}\n{exec_res.stderr}"
    metrics = parse_test_metrics(combined_output)
    exec_id = str(uuid.uuid4())

    await save_test_execution_record(
        exec_id=exec_id,
        session_id=session_id,
        command=exec_res.command,
        working_dir=workspace_root,
        return_code=exec_res.return_code,
        passed_tests=metrics["passed"],
        failed_tests=metrics["failed"],
        skipped_tests=metrics["skipped"],
        stdout=exec_res.stdout,
        stderr=exec_res.stderr,
        execution_time_ms=exec_res.execution_time_ms,
        timed_out=exec_res.timed_out,
    )

    return {
        "id": exec_id,
        "command": exec_res.command,
        "working_dir": workspace_root,
        "return_code": exec_res.return_code,
        "passed": metrics["passed"],
        "failed": metrics["failed"],
        "skipped": metrics["skipped"],
        "stdout": exec_res.stdout,
        "stderr": exec_res.stderr,
        "execution_time_ms": exec_res.execution_time_ms,
        "timed_out": exec_res.timed_out,
        "status": "passed" if exec_res.return_code == 0 else "failed",
    }
