"""Integration tests for FastAPI endpoints."""

from pathlib import Path
import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.database import init_db
from app.main import app


@pytest.mark.asyncio
async def test_health_endpoint(tmp_path: Path):
    settings.DATA_DIR = tmp_path
    settings.DB_FILENAME = "api_test.db"
    await init_db()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://127.0.0.1:8000") as client:
        res = await client.get("/api/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ok"
        assert "ollama_connected" in data
        assert "active_model" in data


@pytest.mark.asyncio
async def test_workspace_and_sessions_api(tmp_path: Path):
    settings.DATA_DIR = tmp_path
    settings.DB_FILENAME = "api_test2.db"
    await init_db()

    workspace = tmp_path / "my_project"
    workspace.mkdir()
    (workspace / "index.py").write_text("print('hello')\n")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://127.0.0.1:8000") as client:
        # Set workspace
        ws_res = await client.post("/api/workspace", json={"workspace_path": str(workspace)})
        assert ws_res.status_code == 200
        assert ws_res.json()["active_workspace"] == str(workspace)

        # Get file tree
        tree_res = await client.get("/api/workspace/tree")
        assert tree_res.status_code == 200
        assert any(c["name"] == "index.py" for c in tree_res.json()["children"])

        # Read file
        file_res = await client.get("/api/workspace/file?path=index.py")
        assert file_res.status_code == 200
        assert file_res.json()["content"] == "print('hello')\n"

        # Create session
        sess_res = await client.post("/api/chat/sessions", json={"title": "Test Chat"})
        assert sess_res.status_code == 200
        session_id = sess_res.json()["id"]

        # List sessions
        list_res = await client.get("/api/chat/sessions")
        assert list_res.status_code == 200
        assert any(s["id"] == session_id for s in list_res.json())
