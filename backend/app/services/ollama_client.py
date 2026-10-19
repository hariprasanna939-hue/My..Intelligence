"""Async HTTPX client communicating strictly with the local Ollama daemon on localhost."""

import json
import logging
from typing import Any, AsyncGenerator, Dict, List, Optional
import httpx
from fastapi import HTTPException

from app.config import settings
from app.schemas import ModelInfo

logger = logging.getLogger("forgelocal.ollama")


class OllamaClient:
    """Encapsulates all calls to local Ollama API."""

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or settings.OLLAMA_BASE_URL).rstrip("/")

    async def check_health(self) -> Dict[str, Any]:
        """Checks if Ollama is running and reachable on localhost."""
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.get(f"{self.base_url}/api/tags")
                if res.status_code == 200:
                    try:
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
                            "error": None,
                        }
                    except Exception as e:
                        return {
                            "connected": False,
                            "url": self.base_url,
                            "models": [],
                            "error": f"Failed to parse Ollama tags response: {str(e)}",
                        }
                return {
                    "connected": False,
                    "url": self.base_url,
                    "models": [],
                    "error": f"Ollama returned HTTP status {res.status_code}",
                }
        except httpx.ConnectError:
            return {
                "connected": False,
                "url": self.base_url,
                "models": [],
                "error": f"Cannot connect to local Ollama at {self.base_url}. Ensure 'ollama serve' is running.",
            }
        except Exception as e:
            return {
                "connected": False,
                "url": self.base_url,
                "models": [],
                "error": str(e),
            }

    async def list_models(self) -> List[ModelInfo]:
        """Returns list of models available in local Ollama."""
        health = await self.check_health()
        return health["models"]

    async def verify_model_installed(self, model_name: str) -> None:
        """Verifies that the requested model is actually installed locally in Ollama.
        
        Never switches to a cloud model or automatically downloads without user intent.
        Explains how the user can install a missing model manually.
        """
        health = await self.check_health()
        if not health["connected"]:
            raise HTTPException(
                status_code=503,
                detail=(
                    f"Ollama server is not running at {self.base_url}. "
                    "Please start it by opening your terminal and running 'ollama serve' or launching Ollama.app."
                ),
            )

        installed_models = health["models"]
        installed_names = [m.name for m in installed_models]

        # Match exact name or name without/with ':latest' tag
        target_clean = model_name.strip()
        matched = False
        for name in installed_names:
            if name == target_clean or name.split(":")[0] == target_clean:
                matched = True
                break

        if not matched:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"Model '{model_name}' is not installed locally in Ollama. "
                    f"To install it manually, open your terminal and run: 'ollama pull {model_name}'. "
                    f"Available local models: {installed_names if installed_names else 'None'}"
                ),
            )

    async def chat_complete(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        num_ctx: Optional[int] = None,
        num_predict: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Non-streaming chat completion with error handling, timeout, and Apple Silicon limits."""
        target_model = model or settings.DEFAULT_MODEL
        await self.verify_model_installed(target_model)

        temp = temperature if temperature is not None else settings.DEFAULT_TEMPERATURE
        ctx = num_ctx if num_ctx is not None else settings.DEFAULT_NUM_CTX
        predict = num_predict if num_predict is not None else settings.DEFAULT_NUM_PREDICT

        payload = {
            "model": target_model,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": temp,
                "num_ctx": ctx,
                "num_predict": predict,
                "top_p": settings.DEFAULT_TOP_P,
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
                try:
                    data = res.json()
                    if not data or "message" not in data:
                        raise HTTPException(
                            status_code=502,
                            detail="Malformed or empty response payload received from Ollama.",
                        )
                    return data
                except json.JSONDecodeError:
                    raise HTTPException(
                        status_code=502,
                        detail="Ollama returned invalid JSON response.",
                    )
        except httpx.ConnectError:
            raise HTTPException(
                status_code=503,
                detail=f"Cannot connect to local Ollama at {self.base_url}. Ensure 'ollama serve' is running.",
            )
        except httpx.TimeoutException:
            raise HTTPException(
                status_code=504,
                detail=f"Ollama request timed out after {settings.REQUEST_TIMEOUT_SECONDS}s. Consider reducing context or model load.",
            )

    async def chat_stream(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        num_ctx: Optional[int] = None,
        num_predict: Optional[int] = None,
    ) -> AsyncGenerator[str, None]:
        """Streaming chat completion yielding raw JSON chunks from Ollama."""
        target_model = model or settings.DEFAULT_MODEL
        await self.verify_model_installed(target_model)

        temp = temperature if temperature is not None else settings.DEFAULT_TEMPERATURE
        ctx = num_ctx if num_ctx is not None else settings.DEFAULT_NUM_CTX
        predict = num_predict if num_predict is not None else settings.DEFAULT_NUM_PREDICT

        payload = {
            "model": target_model,
            "messages": messages,
            "stream": True,
            "options": {
                "temperature": temp,
                "num_ctx": ctx,
                "num_predict": predict,
                "top_p": settings.DEFAULT_TOP_P,
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
        except httpx.TimeoutException:
            raise HTTPException(
                status_code=504,
                detail=f"Ollama streaming timed out after {settings.REQUEST_TIMEOUT_SECONDS}s.",
            )


ollama_client = OllamaClient()
