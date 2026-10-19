"""Configuration settings for ForgeLocal backend.

Designed for strict localhost binding and local-first operation.
"""

from pathlib import Path
from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration with safe offline defaults."""

    # Networking: strictly bound to localhost
    HOST: str = "127.0.0.1"
    PORT: int = 8000

    # Local Ollama runtime configuration
    OLLAMA_BASE_URL: str = "http://127.0.0.1:11434"
    DEFAULT_MODEL: str = "qwen2.5-coder:7b"
    REQUEST_TIMEOUT_SECONDS: float = 120.0

    # Storage paths
    DATA_DIR: Path = Path(__file__).resolve().parent.parent / "data"
    DB_FILENAME: str = "forgelocal.db"

    @property
    def DATABASE_PATH(self) -> Path:
        self.DATA_DIR.mkdir(parents=True, exist_ok=True)
        return self.DATA_DIR / self.DB_FILENAME

    # Default active workspace (if any)
    ACTIVE_WORKSPACE: Optional[str] = None

    # Sandbox & Security restrictions
    MAX_FILE_SIZE_BYTES: int = 500_000  # 500 KB limit for reading code files
    MAX_COMMAND_OUTPUT_BYTES: int = 64_000  # 64 KB output buffer
    COMMAND_TIMEOUT_SECONDS: int = 30  # Maximum execution time for approved commands

    # Explicit allowlist of allowed base command binaries
    ALLOWED_COMMANDS: List[str] = [
        "pytest",
        "python",
        "python3",
        "npm",
        "npx",
        "node",
        "git",
        "ruff",
        "black",
        "flake8",
        "mypy",
        "cargo",
        "go",
        "ls",
    ]

    # Sensitive filenames/patterns that must NEVER be accessed or read
    BLOCKED_FILE_PATTERNS: List[str] = [
        ".env",
        ".env.*",
        "*.pem",
        "*.key",
        "id_rsa",
        "id_ed25519",
        "*.pfx",
        "*.p12",
        "credentials.json",
        "service_account.json",
        ".git/config",
        ".netrc",
        ".bash_history",
        ".zsh_history",
    ]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="FORGELOCAL_",
        extra="ignore",
    )


settings = Settings()
