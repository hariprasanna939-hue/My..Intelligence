"""Async HTTPX client strictly communicating with the local Ollama daemon."""

import json
from typing import Any, AsyncGenerator, Dict, List, Optional
import httpx
from fastapi import HTTPException

from app.config import settings
from app.schemas import ModelInfo


class OllamaClient:
    """Encapsulates all calls to local Ollama API."""

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or settings.OLLAMA_BASE_URL).rstrip("/")

    async def check_health(self) -> Dict[str, Any]:
        """Checks if Ollama is running and reachable on localhost."""
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.get(f"{self.base_url}/api/tags")
                if res.status_code == 200:
                    data = res.json()
                    models = [
                        ModelInfo(
                            name=m.get("name", "unknown"),
                            size=m.get("size"),
                            modified_at=m.get("modified_at"),
                            parameter_size=m.get("details", {}).get("parameter_size"),
                            quantization_level=m.get("details", {}).get("quantization_level"),
                        )
                        for m in data.get("models", [])
                    ]
                    return {
                        "connected": True,
                        "url": self.base_url,
                        "models": models,
                    }
        except Exception:
            pass

        return {
            "connected": False,
            "url": self.base_url,
            "models": [],
        }

    async def list_models(self) -> List[ModelInfo]:
        """Returns list of models available in local Ollama."""
        health = await self.check_health()
        return health["models"]

    async def chat_complete(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.2,
    ) -> Dict[str, Any]:
        """Non-streaming chat completion."""
        target_model = model or settings.DEFAULT_MODEL
        payload = {
            "model": target_model,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": temperature,
            },
        }

        try:
            async with httpx.AsyncClient(timeout=settings.REQUEST_TIMEOUT_SECONDS) as client:
                res = await client.post(f"{self.base_url}/api/chat", json=payload)
                if res.status_code != 200:
                    raise HTTPException(
                        status_code=502,
                        detail=f"Ollama returned error status {res.status_code}: {res.text}",
                    )
                return res.json()
        except httpx.ConnectError:
            raise HTTPException(
                status_code=503,
                detail=f"Cannot connect to local Ollama at {self.base_url}. Ensure 'ollama serve' is running.",
            )

    async def chat_stream(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.2,
    ) -> AsyncGenerator[str, None]:
        """Streaming chat completion yielding raw JSON chunks from Ollama."""
        target_model = model or settings.DEFAULT_MODEL
        payload = {
            "model": target_model,
            "messages": messages,
            "stream": True,
            "options": {
                "temperature": temperature,
            },
        }

        try:
            async with httpx.AsyncClient(timeout=settings.REQUEST_TIMEOUT_SECONDS) as client:
                async with client.stream("POST", f"{self.base_url}/api/chat", json=payload) as response:
                    if response.status_code != 200:
                        error_text = await response.aread()
                        raise HTTPException(
                            status_code=502,
                            detail=f"Ollama streaming error {response.status_code}: {error_text.decode('utf-8', errors='replace')}",
                        )
                    async for line in response.aiter_lines():
                        if line:
                            yield line
        except httpx.ConnectError:
            raise HTTPException(
                status_code=503,
                detail=f"Cannot connect to local Ollama at {self.base_url}. Ensure 'ollama serve' is running.",
            )


ollama_client = OllamaClient()
