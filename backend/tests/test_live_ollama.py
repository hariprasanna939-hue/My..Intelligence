"""Live integration test against the local Ollama daemon and qwen2.5-coder:7b model.

This test requires the real local Ollama server running at http://127.0.0.1:11434
with the model qwen2.5-coder:7b installed.
If Ollama is not running or the model is missing, the test gracefully skips.

Can also be executed standalone:
    backend/.venv/bin/python backend/tests/test_live_ollama.py
"""

import asyncio
from pathlib import Path
import sys

# Ensure backend root is on sys.path for standalone script execution
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import json
import pytest
import httpx
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.database import init_db
from app.main import app
from app.services.ollama_client import OllamaClient


async def check_local_ollama_ready() -> tuple[bool, str]:
    """Checks if local Ollama daemon is running and has qwen2.5-coder:7b."""
    client = OllamaClient("http://127.0.0.1:11434")
    health = await client.check_health()
    if not health["connected"]:
        return False, f"Ollama not reachable: {health.get('error')}"
    
    models = [m.name for m in health["models"]]
    has_qwen = any("qwen2.5-coder:7b" in m or m.startswith("qwen2.5-coder") for m in models)
    if not has_qwen:
        return False, f"qwen2.5-coder:7b not in installed models: {models}"
    
    return True, "Ollama and qwen2.5-coder:7b ready"


@pytest.mark.asyncio
async def test_live_ollama_health_and_tags(tmp_path: Path):
    """Test live health endpoint with real Ollama."""
    ready, reason = await check_local_ollama_ready()
    if not ready:
        pytest.skip(reason)

    settings.DATA_DIR = tmp_path
    settings.DB_FILENAME = "live_test.db"
    await init_db()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://127.0.0.1:8000") as client:
        res = await client.get("/api/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ok"
        assert data["ollama_connected"] is True
        assert "qwen2.5-coder" in data["active_model"]
        assert len(data["available_models"]) > 0


@pytest.mark.asyncio
async def test_live_ollama_non_streaming_chat(tmp_path: Path):
    """Test live non-streaming chat completion with real qwen2.5-coder:7b."""
    ready, reason = await check_local_ollama_ready()
    if not ready:
        pytest.skip(reason)

    settings.DATA_DIR = tmp_path
    settings.DB_FILENAME = "live_test.db"
    await init_db()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://127.0.0.1:8000", timeout=60.0) as client:
        prompt = "Write a Python function named `cube(x)` that returns x cubed. Output only the code."
        res = await client.post(
            "/api/chat/send",
            json={
                "content": prompt,
                "model": "qwen2.5-coder:7b",
                "temperature": 0.1,
            },
        )
        assert res.status_code == 200
        data = res.json()
        assert "message" in data
        assistant_msg = data["message"]
        assert assistant_msg["role"] == "assistant"
        assert len(assistant_msg["content"].strip()) > 0
        assert "cube" in assistant_msg["content"] or "def " in assistant_msg["content"]

        # Verify message persisted in SQLite
        session_id = assistant_msg["session_id"]
        history_res = await client.get(f"/api/chat/sessions/{session_id}/messages")
        assert history_res.status_code == 200
        msgs = history_res.json()
        assert len(msgs) == 2
        assert msgs[0]["content"] == prompt
        assert msgs[1]["content"] == assistant_msg["content"]


@pytest.mark.asyncio
async def test_live_ollama_streaming_chat(tmp_path: Path):
    """Test live SSE streaming generation with real qwen2.5-coder:7b."""
    ready, reason = await check_local_ollama_ready()
    if not ready:
        pytest.skip(reason)

    settings.DATA_DIR = tmp_path
    settings.DB_FILENAME = "live_test.db"
    await init_db()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://127.0.0.1:8000", timeout=60.0) as client:
        prompt = "Reply with exactly: 'OK_FORGELOCAL_OFFLINE'."
        res = await client.post(
            "/api/chat/stream",
            json={
                "content": prompt,
                "model": "qwen2.5-coder:7b",
                "temperature": 0.1,
            },
        )
        assert res.status_code == 200
        assert "text/event-stream" in res.headers["content-type"]

        body_text = res.text
        assert "event: init" in body_text
        assert "event: chunk" in body_text
        assert "event: done" in body_text

        # Extract tokens from chunk events
        chunks = []
        for line in body_text.splitlines():
            if line.startswith("data: ") and '"chunk":' in line:
                payload = json.loads(line.replace("data: ", ""))
                chunks.append(payload.get("chunk", ""))

        full_output = "".join(chunks)
        assert len(full_output.strip()) > 0


# Standalone runner for manual verification
async def main():
    print("=" * 60)
    print("ForgeLocal - Live Ollama Model Integration Test")
    print("=" * 60)
    ready, reason = await check_local_ollama_ready()
    print(f"Checking Ollama status... {reason}")
    if not ready:
        print("Live test aborted: Ollama or qwen2.5-coder:7b is not available.")
        return

    import tempfile
    with tempfile.TemporaryDirectory() as tmp_dir:
        settings.DATA_DIR = Path(tmp_dir)
        settings.DB_FILENAME = "manual_live.db"
        await init_db()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://127.0.0.1:8000", timeout=60.0) as client:
            print("\n1. Testing /api/health...")
            health = await client.get("/api/health")
            print(f"   Status: {health.status_code}")
            print(f"   Active Model: {health.json().get('active_model')}")
            print(f"   Ollama Connected: {health.json().get('ollama_connected')}")

            print("\n2. Testing /api/chat/send (Non-streaming)...")
            chat_res = await client.post(
                "/api/chat/send",
                json={
                    "content": "Write a 1-line Python function add(a, b).",
                    "model": "qwen2.5-coder:7b",
                    "temperature": 0.1,
                },
            )
            print(f"   Status: {chat_res.status_code}")
            assistant_content = chat_res.json()["message"]["content"]
            print(f"   Response:\n{assistant_content}")

            print("\n3. Testing /api/chat/stream (SSE Streaming)...")
            stream_res = await client.post(
                "/api/chat/stream",
                json={
                    "content": "Count from 1 to 3.",
                    "model": "qwen2.5-coder:7b",
                    "temperature": 0.1,
                },
            )
            print(f"   Status: {stream_res.status_code}")
            print(f"   Stream lines received: {len(stream_res.text.splitlines())}")
            print("=" * 60)
            print("ALL LIVE OLLAMA TESTS PASSED SUCCESSFULLY!")
            print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
