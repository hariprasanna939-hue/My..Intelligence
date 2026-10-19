#!/usr/bin/env python3
"""Runner script for ForgeLocal backend."""

import uvicorn
from app.config import settings

if __name__ == "__main__":
    print(f"Starting ForgeLocal Backend on http://{settings.HOST}:{settings.PORT}")
    print(f"Local Ollama URL: {settings.OLLAMA_BASE_URL}")
    print(f"Default model: {settings.DEFAULT_MODEL}")
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
    )
