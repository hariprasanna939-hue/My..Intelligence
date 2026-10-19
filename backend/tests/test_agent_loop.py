"""Tests for Bounded Agent Loop, Task Plans, and Tool Execution."""

import json
from pathlib import Path
from unittest.mock import AsyncMock, patch
import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.database import get_task_plans_for_session, init_db
from app.main import app
from app.services.agent import generate_task_plan
from app.services.agent_tools import agent_tools
from app.services.ollama_client import ollama_client


def test_generate_task_plan():
    """Generates mode-specific, grounded 4-step plans."""
    fix_plan = generate_task_plan("There is a bug in auth.py causing TypeError", "fix")
    assert len(fix_plan) == 4
    assert any("bug" in s.lower() or "error" in s.lower() for s in fix_plan)

    test_plan = generate_task_plan("Write tests for calculator", "test")
    assert len(test_plan) == 4
    assert any("test" in s.lower() for s in test_plan)

    refactor_plan = generate_task_plan("Refactor database connection pool", "refactor")
    assert len(refactor_plan) == 4
    assert any("refactor" in s.lower() for s in refactor_plan)


@pytest.mark.asyncio
async def test_agent_tools_read_only_execution(tmp_path: Path):
    """Safe read-only tools execute without disk writes or approvals."""
    ws = tmp_path / "workspace"
    ws.mkdir()
    f1 = ws / "hello.py"
    f1.write_text("print('hello world')\n", encoding="utf-8")

    # 1. list_workspace_files
    list_tool = agent_tools.get_tool("list_workspace_files")
    assert list_tool.is_read_only is True
    res = await list_tool.handler(str(ws), {}, {})
    assert res["status"] == "success"
    assert any(f["relative_path"] == "hello.py" for f in res["files"])

    # 2. search_filenames
    search_tool = agent_tools.get_tool("search_filenames")
    s_res = await search_tool.handler(str(ws), {"pattern": "hello*"}, {})
    assert s_res["match_count"] == 1
    assert s_res["matches"][0]["relative_path"] == "hello.py"

    # 3. read_file
    read_tool = agent_tools.get_tool("read_file")
    r_res = await read_tool.handler(str(ws), {"path": "hello.py"}, {})
    assert r_res["status"] == "success"
    assert "hello world" in r_res["content"]


@pytest.mark.asyncio
async def test_agent_loop_read_only_tool_streaming(tmp_path: Path):
    """Agent loop runs read-only tool, feeds observation back, and concludes."""
    settings.DATA_DIR = tmp_path
    settings.DB_FILENAME = "test_agent_loop.db"
    await init_db()

    ws = tmp_path / "workspace"
    ws.mkdir()
    (ws / "math_utils.py").write_text("def multiply(a, b): return a * b\n", encoding="utf-8")

    # Stream turns:
    # Turn 1: Model requests read_file
    # Turn 2: Model finishes with answer
    turn1_chunks = [
        json.dumps({"message": {"role": "assistant", "content": "I will read the file.\n```forgelocal-action\n{\"action\": \"read_file\", \"path\": \"math_utils.py\"}\n```\n"}, "done": True})
    ]
    turn2_chunks = [
        json.dumps({"message": {"role": "assistant", "content": "The file contains a multiply function."}, "done": True})
    ]

    call_count = 0
    async def mock_chat_stream(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            for c in turn1_chunks:
                yield c
        else:
            for c in turn2_chunks:
                yield c

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://127.0.0.1:8000") as client:
        with patch.object(ollama_client, "chat_stream", side_effect=mock_chat_stream):
            res = await client.post(
                "/api/chat/stream",
                json={"content": "What is in math_utils.py?", "workspace_path": str(ws)},
            )
            assert res.status_code == 200
            body = res.text

            # Verify SSE event flow
            assert "event: init" in body
            assert "event: plan" in body
            assert "event: tool_start" in body
            assert "read_file" in body
            assert "event: tool_result" in body
            assert "event: plan_update" in body
            assert "event: done" in body
            assert call_count == 2


@pytest.mark.asyncio
async def test_agent_loop_modification_halts_for_approval(tmp_path: Path):
    """When the model proposes a file modification, approvals are emitted and the loop halts."""
    settings.DATA_DIR = tmp_path
    settings.DB_FILENAME = "test_agent_approval.db"
    await init_db()

    ws = tmp_path / "workspace"
    ws.mkdir()
    (ws / "sample.py").write_text("def sample(): pass\n", encoding="utf-8")

    turn1_chunks = [
        json.dumps({
            "message": {
                "role": "assistant",
                "content": 'I propose updating sample.py.\n```forgelocal-action\n{"action": "propose_file_edit", "path": "sample.py", "content": "def sample(): return 42\\n", "reason": "Return 42"}\n```',
            },
            "done": True,
        })
    ]

    async def mock_chat_stream(*args, **kwargs):
        for c in turn1_chunks:
            yield c

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://127.0.0.1:8000") as client:
        with patch.object(ollama_client, "chat_stream", side_effect=mock_chat_stream):
            res = await client.post(
                "/api/chat/stream",
                json={"content": "Update sample to return 42", "workspace_path": str(ws)},
            )
            assert res.status_code == 200
            body = res.text

            # Approvals event emitted, no further tool loop execution
            assert "event: approvals" in body
            assert "sample.py" in body
            assert "event: done" in body


@pytest.mark.asyncio
async def test_clear_all_history_endpoint(tmp_path: Path):
    """DELETE /api/chat/history wipes all sessions, messages, plans, and approvals."""
    settings.DATA_DIR = tmp_path
    settings.DB_FILENAME = "test_clear_history.db"
    await init_db()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://127.0.0.1:8000") as client:
        # Create a session
        sess_res = await client.post("/api/chat/sessions", json={"title": "Session to wipe"})
        assert sess_res.status_code == 200
        sess_id = sess_res.json()["id"]

        # Clear all history
        del_res = await client.delete("/api/chat/history")
        assert del_res.status_code == 200
        data = del_res.json()
        assert data["status"] == "success"
        assert data["cleared"]["sessions_deleted"] >= 1

        # Verify sessions are now empty
        list_res = await client.get("/api/chat/sessions")
        assert list_res.status_code == 200
        assert len(list_res.json()) == 0
