"""SQLite local database persistence for sessions, chat history, settings, and approvals."""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional
import aiosqlite

from app.config import settings


async def init_db() -> None:
    """Initializes the SQLite database tables and indexes."""
    db_path = settings.DATABASE_PATH
    db_path.parent.mkdir(parents=True, exist_ok=True)

    async with aiosqlite.connect(db_path) as db:
        await db.execute("PRAGMA journal_mode=WAL;")
        await db.execute("PRAGMA foreign_keys=ON;")

        # Sessions table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                workspace_path TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # Messages table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                tool_calls TEXT,
                tool_results TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );
        """)

        # Approvals table (human-in-the-loop audit trail)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS approvals (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                action_type TEXT NOT NULL,
                target_path TEXT,
                content TEXT,
                original_content TEXT,
                diff TEXT,
                command_args TEXT,
                reason TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                execution_result TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                resolved_at TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
            );
        """)

        # App settings table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        await db.execute("CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);")
        await db.commit()


from contextlib import asynccontextmanager

@asynccontextmanager
async def get_db_connection():
    """Async context manager that yields an aiosqlite connection with row factory."""
    async with aiosqlite.connect(settings.DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA foreign_keys=ON;")
        yield db


# Helper methods for settings persistence
async def get_setting(key: str, default: Optional[str] = None) -> Optional[str]:
    async with get_db_connection() as db:
        async with db.execute("SELECT value FROM app_settings WHERE key = ?", (key,)) as cursor:
            row = await cursor.fetchone()
            if row:
                return row["value"]
            return default


async def set_setting(key: str, value: str) -> None:
    async with get_db_connection() as db:
        await db.execute("""
            INSERT INTO app_settings (key, value, updated_at) 
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        """, (key, value))
        await db.commit()
