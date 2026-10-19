"""Health and local environment status router."""

from fastapi import APIRouter
from app.config import settings
from app.database import get_setting
from app.schemas import HealthResponse
from app.services.ollama_client import ollama_client

router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("", response_model=HealthResponse)
async def get_health():
    """Checks the health of ForgeLocal backend and local Ollama daemon."""
    ollama_health = await ollama_client.check_health()
    active_workspace = await get_setting("active_workspace", settings.ACTIVE_WORKSPACE)

    return HealthResponse(
        status="ok",
        version="1.0.0",
        ollama_connected=ollama_health["connected"],
        ollama_url=ollama_client.base_url,
        active_model=settings.DEFAULT_MODEL,
        available_models=ollama_health["models"],
        active_workspace=active_workspace,
    )
