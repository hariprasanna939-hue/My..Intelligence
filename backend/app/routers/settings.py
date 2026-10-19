"""Application settings management router."""

from fastapi import APIRouter
from app.config import settings
from app.database import get_setting, set_setting
from app.schemas import AppSettings, AppSettingsUpdate

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("", response_model=AppSettings)
async def get_current_settings():
    """Retrieves current application settings with persistent overrides from SQLite."""
    active_workspace = await get_setting("active_workspace", settings.ACTIVE_WORKSPACE)
    ollama_url = await get_setting("ollama_base_url", settings.OLLAMA_BASE_URL)
    default_model = await get_setting("default_model", settings.DEFAULT_MODEL)
    temp_raw = await get_setting("temperature", str(settings.DEFAULT_TEMPERATURE))
    ctx_raw = await get_setting("num_ctx", str(settings.DEFAULT_NUM_CTX))
    predict_raw = await get_setting("num_predict", str(settings.DEFAULT_NUM_PREDICT))
    timeout_raw = await get_setting("request_timeout_seconds", str(settings.REQUEST_TIMEOUT_SECONDS))

    return AppSettings(
        ollama_base_url=ollama_url or settings.OLLAMA_BASE_URL,
        default_model=default_model or settings.DEFAULT_MODEL,
        temperature=float(temp_raw) if temp_raw else settings.DEFAULT_TEMPERATURE,
        num_ctx=int(ctx_raw) if ctx_raw else settings.DEFAULT_NUM_CTX,
        num_predict=int(predict_raw) if predict_raw else settings.DEFAULT_NUM_PREDICT,
        request_timeout_seconds=float(timeout_raw) if timeout_raw else settings.REQUEST_TIMEOUT_SECONDS,
        allowed_commands=settings.ALLOWED_COMMANDS,
        command_timeout_seconds=settings.COMMAND_TIMEOUT_SECONDS,
        max_file_size_bytes=settings.MAX_FILE_SIZE_BYTES,
        active_workspace=active_workspace,
    )


@router.patch("", response_model=AppSettings)
async def update_settings(update: AppSettingsUpdate):
    """Updates runtime application settings and persists them to SQLite."""
    if update.ollama_base_url is not None:
        settings.OLLAMA_BASE_URL = update.ollama_base_url
        await set_setting("ollama_base_url", update.ollama_base_url)

    if update.default_model is not None:
        settings.DEFAULT_MODEL = update.default_model
        await set_setting("default_model", update.default_model)

    if update.temperature is not None:
        settings.DEFAULT_TEMPERATURE = update.temperature
        await set_setting("temperature", str(update.temperature))

    if update.num_ctx is not None:
        settings.DEFAULT_NUM_CTX = update.num_ctx
        await set_setting("num_ctx", str(update.num_ctx))

    if update.num_predict is not None:
        settings.DEFAULT_NUM_PREDICT = update.num_predict
        await set_setting("num_predict", str(update.num_predict))

    if update.request_timeout_seconds is not None:
        settings.REQUEST_TIMEOUT_SECONDS = update.request_timeout_seconds
        await set_setting("request_timeout_seconds", str(update.request_timeout_seconds))

    if update.command_timeout_seconds is not None:
        settings.COMMAND_TIMEOUT_SECONDS = update.command_timeout_seconds
        await set_setting("command_timeout_seconds", str(update.command_timeout_seconds))

    if update.allowed_commands is not None:
        settings.ALLOWED_COMMANDS = update.allowed_commands

    if update.active_workspace is not None:
        settings.ACTIVE_WORKSPACE = update.active_workspace
        await set_setting("active_workspace", update.active_workspace)

    return await get_current_settings()
