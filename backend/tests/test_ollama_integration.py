"""Automated tests for Ollama integration edge cases using mocked HTTPX calls.

Covers:
1. Request validation (empty content, whitespace, missing fields)
2. Unavailable Ollama daemon (ConnectError -> HTTP 503 with user instructions)
3. Missing model error (model not in tags -> HTTP 404 with manual ollama pull guidance)
4. Malformed responses (HTTP 500 from Ollama, non-JSON, empty/missing message payload -> HTTP 502)
5. Request timeout (TimeoutException -> HTTP 504)
6. Successful chat completion with mocked responses & SQLite persistence
7. Streaming SSE events (init, chunk, done) with mocked generator & SQLite persistence
8. Streaming error SSE emission when Ollama fails
"""

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
import json
import pytest
import httpx
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.database import init_db
from app.main import app
from app.services.ollama_client import OllamaClient, ollama_client


async def init_test_env(tmp_path: Path):
    """Setup isolated test database for each test."""
    settings.DATA_DIR = tmp_path
    settings.DB_FILENAME = "test_ollama.db"
    settings.OLLAMA_BASE_URL = "http://127.0.0.1:11434"
    await init_db()


# ---------------------------------------------------------------------------
# 1. Request Validation Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_chat_send_empty_content_validation(tmp_path: Path):
    """Sending empty string or whitespace returns 422 Unprocessable Entity or 400."""
    await init_test_env(tmp_path)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://127.0.0.1:8000") as client:
        # Empty string violates min_length=1
        res = await client.post("/api/chat/send", json={"content": ""})
        assert res.status_code in (400, 422)

        # Whitespace-only string caught by validation
        res2 = await client.post("/api/chat/send", json={"content": "   \n\t  "})
        assert res2.status_code == 400
        assert "empty" in res2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_chat_stream_empty_content_validation(tmp_path: Path):
    """Streaming with empty content returns 422 or 400."""
    await init_test_env(tmp_path)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://127.0.0.1:8000") as client:
        res = await client.post("/api/chat/stream", json={"content": ""})
        assert res.status_code in (400, 422)

        res2 = await client.post("/api/chat/stream", json={"content": "   "})
        assert res2.status_code == 400
        assert "empty" in res2.json()["detail"].lower()


# ---------------------------------------------------------------------------
# 2. Unavailable Ollama Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_ollama_client_check_health_when_down(tmp_path: Path):
    """When Ollama is down, check_health reports connected: False and 'ollama serve' guidance."""
    await init_test_env(tmp_path)
    client = OllamaClient("http://127.0.0.1:11434")

    mock_client = AsyncMock()
    mock_client.get.side_effect = httpx.ConnectError("Connection refused")

    with patch("app.services.ollama_client.httpx.AsyncClient", return_value=mock_client):
        mock_client.__aenter__.return_value = mock_client
        health = await client.check_health()
        assert health["connected"] is False
        assert "ollama serve" in health["error"].lower()


@pytest.mark.asyncio
async def test_chat_send_when_ollama_unavailable(tmp_path: Path):
    """When Ollama is not running, /api/chat/send returns HTTP 503."""
    await init_test_env(tmp_path)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://127.0.0.1:8000") as client:
        with patch.object(
            ollama_client,
            "chat_complete",
            side_effect=HTTPException(
                status_code=503,
                detail="Cannot connect to local Ollama. Ensure 'ollama serve' is running.",
            ),
        ):
            res = await client.post("/api/chat/send", json={"content": "Hello"})
            assert res.status_code == 503
            assert "ollama serve" in res.json()["detail"].lower()


# ---------------------------------------------------------------------------
# 3. Missing Model Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_missing_model_raises_404_with_pull_instruction(tmp_path: Path):
    """When requested model is not installed locally, returns HTTP 404 with manual pull command."""
    await init_test_env(tmp_path)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://127.0.0.1:8000") as client:
        with patch.object(
            ollama_client,
            "chat_complete",
            side_effect=HTTPException(
                status_code=404,
                detail="Model 'nonexistent:model' is not installed locally in Ollama. Run: 'ollama pull nonexistent:model'",
            ),
        ):
            res = await client.post(
                "/api/chat/send",
                json={"content": "Hello", "model": "nonexistent:model"},
            )
            assert res.status_code == 404
            detail = res.json()["detail"]
            assert "ollama pull nonexistent:model" in detail


@pytest.mark.asyncio
async def test_ollama_client_verify_model_installed(tmp_path: Path):
    """OllamaClient.verify_model_installed checks tags and raises 404 if missing."""
    await init_test_env(tmp_path)
    client = OllamaClient("http://127.0.0.1:11434")

    # Mock health returning installed models
    with patch.object(
        client,
        "check_health",
        return_value={
            "connected": True,
            "url": "http://127.0.0.1:11434",
            "models": [MagicMock(name="qwen2.5-coder:7b")],
            "error": None,
        },
    ):
        # Setting mock name attribute properly
        client.check_health.return_value["models"][0].name = "qwen2.5-coder:7b"

        # Matching model should pass without exception
        await client.verify_model_installed("qwen2.5-coder:7b")

        # Missing model must raise HTTPException 404
        with pytest.raises(HTTPException) as exc_info:
            await client.verify_model_installed("unknown-model:latest")
        assert exc_info.value.status_code == 404
        assert "ollama pull unknown-model:latest" in exc_info.value.detail


# ---------------------------------------------------------------------------
# 4. Malformed Responses & Upstream Errors
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_ollama_client_upstream_500_error(tmp_path: Path):
    """When Ollama daemon returns HTTP 500, chat_complete raises HTTP 502."""
    await init_test_env(tmp_path)
    client = OllamaClient("http://127.0.0.1:11434")

    mock_resp = httpx.Response(500, text="Internal Model Error")
    mock_http_client = AsyncMock()
    mock_http_client.post.return_value = mock_resp
    mock_http_client.__aenter__.return_value = mock_http_client

    with patch.object(client, "verify_model_installed", return_value=None), \
         patch("app.services.ollama_client.httpx.AsyncClient", return_value=mock_http_client):
        with pytest.raises(HTTPException) as exc_info:
            await client.chat_complete([{"role": "user", "content": "test"}])
        assert exc_info.value.status_code == 502
        assert "Internal Model Error" in exc_info.value.detail


@pytest.mark.asyncio
async def test_ollama_client_malformed_json_response(tmp_path: Path):
    """When Ollama returns invalid JSON, chat_complete raises HTTP 502."""
    await init_test_env(tmp_path)
    client = OllamaClient("http://127.0.0.1:11434")

    mock_resp = httpx.Response(200, text="<not-json>")
    mock_http_client = AsyncMock()
    mock_http_client.post.return_value = mock_resp
    mock_http_client.__aenter__.return_value = mock_http_client

    with patch.object(client, "verify_model_installed", return_value=None), \
         patch("app.services.ollama_client.httpx.AsyncClient", return_value=mock_http_client):
        with pytest.raises(HTTPException) as exc_info:
            await client.chat_complete([{"role": "user", "content": "test"}])
        assert exc_info.value.status_code == 502
        assert "invalid JSON" in exc_info.value.detail


@pytest.mark.asyncio
async def test_ollama_client_missing_message_field(tmp_path: Path):
    """When Ollama returns JSON without a 'message' key, raises HTTP 502."""
    await init_test_env(tmp_path)
    client = OllamaClient("http://127.0.0.1:11434")

    mock_resp = httpx.Response(200, json={"done": True})
    mock_http_client = AsyncMock()
    mock_http_client.post.return_value = mock_resp
    mock_http_client.__aenter__.return_value = mock_http_client

    with patch.object(client, "verify_model_installed", return_value=None), \
         patch("app.services.ollama_client.httpx.AsyncClient", return_value=mock_http_client):
        with pytest.raises(HTTPException) as exc_info:
            await client.chat_complete([{"role": "user", "content": "test"}])
        assert exc_info.value.status_code == 502
        assert "Malformed or empty" in exc_info.value.detail


# ---------------------------------------------------------------------------
# 5. Timeout Handling
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_ollama_client_timeout_handling(tmp_path: Path):
    """When Ollama request times out, chat_complete raises HTTP 504."""
    await init_test_env(tmp_path)
    client = OllamaClient("http://127.0.0.1:11434")

    mock_http_client = AsyncMock()
    mock_http_client.post.side_effect = httpx.TimeoutException("Read timeout")
    mock_http_client.__aenter__.return_value = mock_http_client

    with patch.object(client, "verify_model_installed", return_value=None), \
         patch("app.services.ollama_client.httpx.AsyncClient", return_value=mock_http_client):
        with pytest.raises(HTTPException) as exc_info:
            await client.chat_complete([{"role": "user", "content": "test"}])
        assert exc_info.value.status_code == 504
        assert "timed out" in exc_info.value.detail.lower()


# ---------------------------------------------------------------------------
# 6. Successful Mocked Chat Completion & Persistence
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_ollama_successful_chat_persisted(tmp_path: Path):
    """Successful chat response persists user and assistant messages in SQLite."""
    await init_test_env(tmp_path)

    mock_result = {
        "model": "qwen2.5-coder:7b",
        "message": {
            "role": "assistant",
            "content": "Hello! I am your local coding assistant running offline.",
        },
        "done": True,
    }

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://127.0.0.1:8000") as client:
        with patch.object(ollama_client, "chat_complete", return_value=mock_result):
            res = await client.post("/api/chat/send", json={"content": "Hello local agent!"})
            assert res.status_code == 200
            data = res.json()
            assert "message" in data
            assistant_msg = data["message"]
            assert assistant_msg["role"] == "assistant"
            assert "offline" in assistant_msg["content"]
            session_id = assistant_msg["session_id"]

            # Verify persisted history in SQLite
            history_res = await client.get(f"/api/chat/sessions/{session_id}/messages")
            assert history_res.status_code == 200
            msgs = history_res.json()
            assert len(msgs) == 2
            assert msgs[0]["role"] == "user"
            assert msgs[0]["content"] == "Hello local agent!"
            assert msgs[1]["role"] == "assistant"
            assert "offline" in msgs[1]["content"]


# ---------------------------------------------------------------------------
# 7. Streaming SSE Tests with Mocked Generator
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_ollama_streaming_sse_events(tmp_path: Path):
    """Streaming endpoint emits SSE chunks and final done event, persisting result in SQLite."""
    await init_test_env(tmp_path)

    chunks = [
        json.dumps({"message": {"role": "assistant", "content": "def "}, "done": False}),
        json.dumps({"message": {"role": "assistant", "content": "add(a, b):"}, "done": False}),
        json.dumps({"message": {"role": "assistant", "content": "\n    return a + b\n"}, "done": True}),
    ]

    async def mock_chat_stream(*args, **kwargs):
        for c in chunks:
            yield c

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://127.0.0.1:8000") as client:
        with patch.object(ollama_client, "chat_stream", side_effect=mock_chat_stream):
            res = await client.post("/api/chat/stream", json={"content": "Write add function"})
            assert res.status_code == 200
            assert "text/event-stream" in res.headers["content-type"]
            body_text = res.text

            # Check that SSE events exist
            assert "event: init" in body_text
            assert "event: chunk" in body_text
            assert "event: done" in body_text
            assert "add(a, b):" in body_text

            # Parse session_id from init event
            init_line = [l for l in body_text.splitlines() if "session_id" in l][0]
            session_id = json.loads(init_line.replace("data: ", ""))["session_id"]

            # Verify persisted history
            history_res = await client.get(f"/api/chat/sessions/{session_id}/messages")
            assert history_res.status_code == 200
            msgs = history_res.json()
            assert len(msgs) == 2
            assert msgs[0]["role"] == "user"
            assert msgs[1]["role"] == "assistant"
            assert msgs[1]["content"] == "def add(a, b):\n    return a + b\n"


@pytest.mark.asyncio
async def test_ollama_streaming_error_event(tmp_path: Path):
    """When Ollama fails during streaming, emits event: error over SSE."""
    await init_test_env(tmp_path)

    async def mock_failing_stream(*args, **kwargs):
        raise HTTPException(status_code=503, detail="Ollama daemon crashed")
        yield ""

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://127.0.0.1:8000") as client:
        with patch.object(ollama_client, "chat_stream", side_effect=mock_failing_stream):
            res = await client.post("/api/chat/stream", json={"content": "Trigger failure"})
            assert res.status_code == 200
            body_text = res.text
            assert "event: error" in body_text
            assert "Ollama daemon crashed" in body_text
