"""SQLite local database persistence for sessions, chat history, settings, approvals, task plans, and backups.

Implements database migrations, WAL mode for high concurrency without locks,
and zero cloud telemetry.
"""

from contextlib import asynccontextmanager
from datetime import datetime, timezone
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional
import aiosqlite

from app.config import settings

logger = logging.getLogger("forgelocal.database")

SCHEMA_VERSION = 2


async def init_db() -> None:
    """Initializes and migrates the SQLite database tables and indexes."""
    db_path = settings.DATABASE_PATH
    db_path.parent.mkdir(parents=True, exist_ok=True)

    async with aiosqlite.connect(db_path) as db:
        await db.execute("PRAGMA journal_mode=WAL;")
        await db.execute("PRAGMA foreign_keys=ON;")

        # Base tables (Version 1)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                workspace_path TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

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

        await db.execute("""
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # Version 2 Tables: Task Plans, Test Executions, and File Backups for Reverts
        await db.execute("""
            CREATE TABLE IF NOT EXISTS task_plans (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                task_description TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'in_progress',
                steps_json TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS test_executions (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                command TEXT NOT NULL,
                working_dir TEXT,
                return_code INTEGER NOT NULL,
                passed_tests INTEGER DEFAULT 0,
                failed_tests INTEGER DEFAULT 0,
                skipped_tests INTEGER DEFAULT 0,
                stdout TEXT,
                stderr TEXT,
                execution_time_ms REAL,
                timed_out BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
            );
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS file_backups (
                id TEXT PRIMARY KEY,
                approval_id TEXT NOT NULL,
                target_path TEXT NOT NULL,
                original_content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE CASCADE
            );
        """)

        # Version 3 Tables: Documents, Document Chunks, SQLite FTS5 Index, and Summaries
        await db.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                filename TEXT NOT NULL,
                file_type TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                storage_path TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'uploaded',
                page_count INTEGER DEFAULT 0,
                extracted_char_count INTEGER DEFAULT 0,
                chunk_count INTEGER DEFAULT 0,
                extraction_warnings TEXT,
                ocr_used BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS document_chunks (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                page_number INTEGER,
                section_heading TEXT,
                content TEXT NOT NULL,
                char_count INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
            );
        """)

        # SQLite FTS5 Virtual Table for full-text search across document chunks
        await db.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS document_chunks_fts USING fts5(
                chunk_id UNINDEXED,
                document_id UNINDEXED,
                content,
                section_heading,
                tokenize = 'porter unicode61'
            );
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS document_summaries (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                summary_type TEXT NOT NULL,
                summary_text TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
            );
        """)

        # Indexes for fast lookups
        await db.execute("CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_task_plans_session ON task_plans(session_id);")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_test_exec_session ON test_executions(session_id);")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_file_backups_approval ON file_backups(approval_id);")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_documents_session ON documents(session_id);")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_document_chunks_doc ON document_chunks(document_id);")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_document_summaries_doc ON document_summaries(document_id);")

        SCHEMA_VERSION_CURRENT = 3
        await db.execute(f"PRAGMA user_version = {SCHEMA_VERSION_CURRENT};")
        await db.commit()


@asynccontextmanager
async def get_db_connection():
    """Async context manager that yields an aiosqlite connection with row factory."""
    async with aiosqlite.connect(settings.DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA foreign_keys=ON;")
        yield db


# -------------------------------------------------------------
# Settings Persistence
# -------------------------------------------------------------

async def get_setting(key: str, default: Optional[str] = None) -> Optional[str]:
    """Retrieves an application setting from SQLite."""
    async with get_db_connection() as db:
        async with db.execute("SELECT value FROM app_settings WHERE key = ?", (key,)) as cursor:
            row = await cursor.fetchone()
            if row:
                return row["value"]
            return default


async def set_setting(key: str, value: str) -> None:
    """Sets or updates an application setting in SQLite."""
    async with get_db_connection() as db:
        await db.execute("""
            INSERT INTO app_settings (key, value, updated_at) 
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        """, (key, value))
        await db.commit()


# -------------------------------------------------------------
# File Backups & Revert Persistence
# -------------------------------------------------------------

async def save_file_backup(backup_id: str, approval_id: str, target_path: str, original_content: str) -> None:
    """Stores a file backup before an approved write or patch."""
    async with get_db_connection() as db:
        await db.execute("""
            INSERT INTO file_backups (id, approval_id, target_path, original_content)
            VALUES (?, ?, ?, ?)
        """, (backup_id, approval_id, target_path, original_content))
        await db.commit()


async def get_file_backup_by_approval(approval_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves file backup associated with an approval."""
    async with get_db_connection() as db:
        async with db.execute("""
            SELECT id, approval_id, target_path, original_content, created_at
            FROM file_backups
            WHERE approval_id = ?
            ORDER BY created_at DESC LIMIT 1
        """, (approval_id,)) as cursor:
            row = await cursor.fetchone()
            if row:
                return dict(row)
            return None


# -------------------------------------------------------------
# Task Plans Persistence
# -------------------------------------------------------------

async def save_task_plan(
    plan_id: str,
    session_id: str,
    task_description: str,
    steps: List[str],
    status: str = "in_progress",
) -> None:
    """Stores or updates a bounded task plan in SQLite."""
    now_iso = datetime.now(timezone.utc).isoformat()
    steps_json = json.dumps(steps)
    async with get_db_connection() as db:
        await db.execute("""
            INSERT INTO task_plans (id, session_id, task_description, status, steps_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET status = excluded.status, steps_json = excluded.steps_json, updated_at = ?
        """, (plan_id, session_id, task_description, status, steps_json, now_iso, now_iso, now_iso))
        await db.commit()


async def get_task_plans_for_session(session_id: str) -> List[Dict[str, Any]]:
    """Gets task plans associated with a chat session."""
    plans = []
    async with get_db_connection() as db:
        async with db.execute("""
            SELECT id, session_id, task_description, status, steps_json, created_at, updated_at
            FROM task_plans
            WHERE session_id = ?
            ORDER BY created_at DESC
        """, (session_id,)) as cursor:
            rows = await cursor.fetchall()
            for r in rows:
                plans.append({
                    "id": r["id"],
                    "session_id": r["session_id"],
                    "task_description": r["task_description"],
                    "status": r["status"],
                    "steps": json.loads(r["steps_json"]),
                    "created_at": r["created_at"],
                    "updated_at": r["updated_at"],
                })
    return plans


# -------------------------------------------------------------
# Test Executions Persistence
# -------------------------------------------------------------

async def save_test_execution_record(
    exec_id: str,
    session_id: Optional[str],
    command: str,
    working_dir: str,
    return_code: int,
    passed_tests: int,
    failed_tests: int,
    skipped_tests: int,
    stdout: str,
    stderr: str,
    execution_time_ms: float,
    timed_out: bool = False,
) -> None:
    """Stores test runner execution details."""
    async with get_db_connection() as db:
        await db.execute("""
            INSERT INTO test_executions (
                id, session_id, command, working_dir, return_code,
                passed_tests, failed_tests, skipped_tests,
                stdout, stderr, execution_time_ms, timed_out
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            exec_id, session_id, command, working_dir, return_code,
            passed_tests, failed_tests, skipped_tests,
            stdout, stderr, execution_time_ms, 1 if timed_out else 0,
        ))
        await db.commit()


# -------------------------------------------------------------
# Clear History & Deletion Actions
# -------------------------------------------------------------

async def clear_all_history() -> Dict[str, int]:
    """Wipes all sessions, messages, approvals, task plans, test executions, backups, and documents."""
    async with get_db_connection() as db:
        cursor = await db.execute("DELETE FROM messages;")
        messages_deleted = cursor.rowcount
        cursor = await db.execute("DELETE FROM approvals;")
        approvals_deleted = cursor.rowcount
        cursor = await db.execute("DELETE FROM task_plans;")
        plans_deleted = cursor.rowcount
        cursor = await db.execute("DELETE FROM test_executions;")
        tests_deleted = cursor.rowcount
        cursor = await db.execute("DELETE FROM file_backups;")
        backups_deleted = cursor.rowcount
        cursor = await db.execute("DELETE FROM document_chunks_fts;")
        cursor = await db.execute("DELETE FROM document_summaries;")
        cursor = await db.execute("DELETE FROM document_chunks;")
        cursor = await db.execute("DELETE FROM documents;")
        docs_deleted = cursor.rowcount
        cursor = await db.execute("DELETE FROM sessions;")
        sessions_deleted = cursor.rowcount
        await db.commit()

    # Clean up physical files in documents directory
    try:
        if settings.DOCUMENTS_DIR.exists():
            for f in settings.DOCUMENTS_DIR.iterdir():
                if f.is_file():
                    f.unlink()
    except Exception as e:
        logger.warning(f"Error cleaning documents directory: {e}")

    return {
        "sessions_deleted": sessions_deleted,
        "messages_deleted": messages_deleted,
        "approvals_deleted": approvals_deleted,
        "plans_deleted": plans_deleted,
        "tests_deleted": tests_deleted,
        "backups_deleted": backups_deleted,
        "documents_deleted": docs_deleted,
    }
