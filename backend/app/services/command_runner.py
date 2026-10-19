"""Secure, controlled command execution service.

Runs approved commands strictly using subprocess argument vectors (no shell=True),
with timeout enforcement, output byte ceilings, and allowlist validation.
"""

import asyncio
import os
from pathlib import Path
import sys
import time
from typing import List, Optional
from fastapi import HTTPException

from app.config import settings
from app.schemas import CommandExecutionResponse
from app.security import sanitize_text, validate_command, validate_workspace_directory


async def execute_command(
    command_args: List[str],
    workspace_root: str,
    timeout_seconds: Optional[int] = None,
) -> CommandExecutionResponse:
    """Executes a validated command within the active workspace directory safely."""
    # 1. Validate workspace
    root_path = validate_workspace_directory(workspace_root)

    # 2. Validate binary and args against allowlist
    binary, args = validate_command(command_args)

    timeout = timeout_seconds or settings.COMMAND_TIMEOUT_SECONDS
    max_output = settings.MAX_COMMAND_OUTPUT_BYTES

    # Build controlled execution environment with venv binaries on PATH
    env = os.environ.copy()
    venv_bins = [
        root_path / ".venv" / "bin",
        root_path / "venv" / "bin",
        Path(sys.prefix) / "bin",
    ]
    extra_paths = [str(p) for p in venv_bins if p.exists()]
    if extra_paths:
        env["PATH"] = ":".join(extra_paths) + ":" + env.get("PATH", "")
    env["PYTHONPATH"] = str(root_path) + ((":" + env["PYTHONPATH"]) if "PYTHONPATH" in env else "")

    start_time = time.perf_counter()
    timed_out = False
    return_code = -1
    stdout_str = ""
    stderr_str = ""

    try:
        # Launch subprocess directly without shell to prevent command chaining / shell injection
        proc = await asyncio.create_subprocess_exec(
            binary,
            *args,
            cwd=str(root_path),
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                proc.communicate(), 
                timeout=float(timeout)
            )
            return_code = proc.returncode if proc.returncode is not None else -1

            # Cap outputs to prevent memory overflow
            if len(stdout_bytes) > max_output:
                stdout_str = stdout_bytes[:max_output].decode("utf-8", errors="replace") + "\n...[Output truncated]"
            else:
                stdout_str = stdout_bytes.decode("utf-8", errors="replace")

            if len(stderr_bytes) > max_output:
                stderr_str = stderr_bytes[:max_output].decode("utf-8", errors="replace") + "\n...[Output truncated]"
            else:
                stderr_str = stderr_bytes.decode("utf-8", errors="replace")

        except asyncio.TimeoutError:
            timed_out = True
            return_code = -1
            try:
                proc.kill()
                await proc.wait()
            except Exception:
                pass
            stderr_str = f"Error: Command timed out after {timeout} seconds."

    except FileNotFoundError:
        return_code = 127
        stderr_str = f"Executable not found on system PATH: '{binary}'"
    except Exception as e:
        return_code = 1
        stderr_str = f"Execution failed: {str(e)}"

    elapsed_ms = (time.perf_counter() - start_time) * 1000.0

    return CommandExecutionResponse(
        command=" ".join(command_args),
        return_code=return_code,
        stdout=sanitize_text(stdout_str),
        stderr=sanitize_text(stderr_str),
        execution_time_ms=round(elapsed_ms, 2),
        timed_out=timed_out,
    )
