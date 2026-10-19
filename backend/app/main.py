"""ForgeLocal Backend Application Entrypoint."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.routers import approvals, chat, commands, health, settings as settings_router, workspace


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle handler."""
    # Ensure local SQLite schema is initialized
    await init_db()
    yield


app = FastAPI(
    title="ForgeLocal Backend",
    description="Offline AI Coding Agent Backend for local model execution.",
    version="1.0.0",
    lifespan=lifespan,
)

# Enforce localhost CORS strictly
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(health.router)
app.include_router(workspace.router)
app.include_router(chat.router)
app.include_router(approvals.router)
app.include_router(commands.router)
app.include_router(settings_router.router)


@app.get("/")
async def root():
    return {
        "app": "ForgeLocal",
        "mode": "offline",
        "status": "running",
        "docs_url": "/docs",
    }
