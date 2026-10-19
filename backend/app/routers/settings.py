"""Application settings management router."""

from fastapi import APIRouter
from app.config import settings
from app.database import get_setting, set_setting
from app.schemas import AppSettings, AppSettingsUpdate

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("", response_model=AppSettings)
async def get_current_settings():
    """Retrieves current application settings."""
    active_workspace = await get_setting("active_workspace", settings.ACTIVE_WORKSPACE)
    ollama_url = await get_setting("ollama_base_url", settings.OLLAMA_BASE_URL)
    default_model = await get_setting("default_model", settings.DEFAULT_MODEL)

    return AppSettings(
        ollama_base_url=ollama_url or settings.OLLAMA_BASE_URL,
        default_model=default_model or settings.DEFAULT_MODEL,
        allowed_commands=settings.ALLOWED_COMMANDS,
        command_timeout_seconds=settings.COMMAND_TIMEOUT_SECONDS,
        max_file_size_bytes=settings.MAX_FILE_SIZE_BYTES,
        active_workspace=active_workspace,
    )


@router.patch("", response_model=AppSettings)
async def update_settings(update: AppSettingsUpdate):
    """Updates runtime application settings."""
    if update.ollama_base_url is not None:
        settings.OLLAMA_BASE_URL = update.ollama_base_url
        await set_setting("ollama_base_url", update.ollama_base_url)

    if update.default_model is not None:
        settings.DEFAULT_MODEL = update.default_model
        await set_setting("default_model", update.default_model)

    if update.command_timeout_seconds is not None:
        settings.COMMAND_TIMEOUT_SECONDS = update.command_timeout_seconds
        await set_setting("command_timeout_seconds", str(update.command_timeout_seconds))

    if update.allowed_commands is not None:
        settings.ALLOWED_COMMANDS = update.allowed_commands

    if update.active_workspace is not None:
        settings.ACTIVE_WORKSPACE = update.active_workspace
        await set_setting("active_workspace", update.active_workspace)

    return await get_current_settings()
