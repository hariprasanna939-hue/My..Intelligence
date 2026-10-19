"""Document Service Orchestration Module for ForgeLocal.

Handles secure file upload, file validation, text extraction, chunking,
indexing into SQLite FTS5, metadata persistence, deletion, and cleanup.
"""

from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import re
from typing import Any, Dict, List, Optional
import uuid

from app.config import settings
from app.database import get_db_connection
from app.services.document_extractors import (
    extract_document,
    is_tesseract_available,
)
from app.services.document_chunker import chunk_extracted_pages
from app.services.document_index import index_document_chunks

logger = logging.getLogger("forgelocal.documents.service")

# Permitted extensions
SUPPORTED_EXTENSIONS = {
    ".pdf", ".docx", ".txt", ".md", ".csv", ".json",
    ".py", ".js", ".jsx", ".ts", ".tsx", ".html", ".css",
    ".sql", ".yaml", ".yml", ".xml", ".toml", ".sh", ".rst", ".ini"
}


def sanitize_filename(filename: str) -> str:
    """Sanitizes user filename to prevent path traversal or special shell characters."""
    base_name = Path(filename).name
    clean = re.sub(r"[^a-zA-Z0-9_\-\. ]", "_", base_name).strip()
    return clean or "unnamed_document"


class DocumentService:
    """Provides complete lifecycle management for offline uploaded documents."""

    @staticmethod
    async def process_document_upload(
        file_bytes: bytes,
        original_filename: str,
        session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Validates, stores, extracts, chunks, and indexes an uploaded file.
        
        Follows the status progression:
        uploaded -> validating -> extracting -> chunking -> indexing -> ready
        """
        # 1. Validation
        if not file_bytes:
            raise ValueError("Uploaded file is empty (0 bytes).")

        if len(file_bytes) > settings.MAX_UPLOAD_FILE_SIZE_BYTES:
            max_mb = settings.MAX_UPLOAD_FILE_SIZE_BYTES // (1024 * 1024)
            raise ValueError(f"File size exceeds maximum allowed upload limit of {max_mb} MB.")

        clean_filename = sanitize_filename(original_filename)
        ext = Path(clean_filename).suffix.lower()

        if ext not in SUPPORTED_EXTENSIONS:
            allowed_list = ", ".join(sorted(SUPPORTED_EXTENSIONS))
            raise ValueError(
                f"Unsupported document format '{ext}'. Supported formats: {allowed_list}"
            )

        # 2. Allocate ID and local storage path
        doc_id = str(uuid.uuid4())
        safe_disk_filename = f"{doc_id}_{clean_filename}"
        storage_path = settings.DOCUMENTS_DIR / safe_disk_filename

        # Write file securely to disk
        storage_path.write_bytes(file_bytes)

        now_iso = datetime.now(timezone.utc).isoformat()

        # Insert initial record (create session if provided and does not exist)
        async with get_db_connection() as db:
            valid_session_id = None
            if session_id:
                async with db.execute("SELECT id FROM sessions WHERE id = ?", (session_id,)) as cursor:
                    exists = await cursor.fetchone()
                if not exists:
                    await db.execute("""
                        INSERT INTO sessions (id, title, created_at, updated_at)
                        VALUES (?, 'Document Conversation', ?, ?)
                    """, (session_id, now_iso, now_iso))
                    await db.commit()
                valid_session_id = session_id

            await db.execute("""
                INSERT INTO documents (
                    id, session_id, filename, file_type, file_size,
                    storage_path, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, 'validating', ?, ?)
            """, (
                doc_id, valid_session_id, clean_filename, ext,
                len(file_bytes), str(storage_path), now_iso, now_iso
            ))
            await db.commit()

        # 3. Extraction
        async with get_db_connection() as db:
            await db.execute("UPDATE documents SET status = 'extracting' WHERE id = ?", (doc_id,))
            await db.commit()

        try:
            extraction_res = extract_document(storage_path, ext)
        except Exception as e:
            async with get_db_connection() as db:
                await db.execute("""
                    UPDATE documents 
                    SET status = 'error', extraction_warnings = ? 
                    WHERE id = ?
                """, (f"Extraction error: {str(e)}", doc_id))
                await db.commit()
            raise ValueError(f"Document extraction failed: {str(e)}")

        # 4. Chunking
        async with get_db_connection() as db:
            await db.execute("UPDATE documents SET status = 'chunking' WHERE id = ?", (doc_id,))
            await db.commit()

        chunks = chunk_extracted_pages(
            pages=extraction_res.pages,
            chunk_size=settings.DOCUMENT_CHUNK_SIZE,
            chunk_overlap=settings.DOCUMENT_CHUNK_OVERLAP,
        )

        # 5. Indexing into SQLite FTS5
        async with get_db_connection() as db:
            await db.execute("UPDATE documents SET status = 'indexing' WHERE id = ?", (doc_id,))
            await db.commit()

        indexed_count = await index_document_chunks(doc_id, chunks)

        # 6. Final Status: Ready
        warnings_json = json.dumps(extraction_res.warnings) if extraction_res.warnings else None
        now_ready = datetime.now(timezone.utc).isoformat()

        async with get_db_connection() as db:
            await db.execute("""
                UPDATE documents SET
                    status = 'ready',
                    page_count = ?,
                    extracted_char_count = ?,
                    chunk_count = ?,
                    extraction_warnings = ?,
                    ocr_used = ?,
                    updated_at = ?
                WHERE id = ?
            """, (
                extraction_res.total_pages_detected,
                extraction_res.total_char_count,
                indexed_count,
                warnings_json,
                1 if extraction_res.ocr_used else 0,
                now_ready,
                doc_id
            ))
            await db.commit()

        return {
            "id": doc_id,
            "session_id": session_id,
            "filename": clean_filename,
            "file_type": ext,
            "file_size": len(file_bytes),
            "status": "ready",
            "page_count": extraction_res.total_pages_detected,
            "extracted_char_count": extraction_res.total_char_count,
            "chunk_count": indexed_count,
            "extraction_warnings": extraction_res.warnings,
            "ocr_used": extraction_res.ocr_used,
            "created_at": now_iso,
            "updated_at": now_ready,
        }

    @staticmethod
    async def list_documents_for_session(session_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Lists all uploaded documents, optionally filtered by conversation session."""
        docs: List[Dict[str, Any]] = []
        async with get_db_connection() as db:
            if session_id:
                sql = """
                    SELECT id, session_id, filename, file_type, file_size,
                           status, page_count, extracted_char_count, chunk_count,
                           extraction_warnings, ocr_used, created_at, updated_at
                    FROM documents
                    WHERE session_id = ?
                    ORDER BY created_at DESC
                """
                cursor = await db.execute(sql, (session_id,))
            else:
                sql = """
                    SELECT id, session_id, filename, file_type, file_size,
                           status, page_count, extracted_char_count, chunk_count,
                           extraction_warnings, ocr_used, created_at, updated_at
                    FROM documents
                    ORDER BY created_at DESC
                """
                cursor = await db.execute(sql)

            rows = await cursor.fetchall()
            for r in rows:
                warnings = []
                if r["extraction_warnings"]:
                    try:
                        warnings = json.loads(r["extraction_warnings"])
                    except Exception:
                        warnings = [r["extraction_warnings"]]

                docs.append({
                    "id": r["id"],
                    "session_id": r["session_id"],
                    "filename": r["filename"],
                    "file_type": r["file_type"],
                    "file_size": r["file_size"],
                    "status": r["status"],
                    "page_count": r["page_count"],
                    "extracted_char_count": r["extracted_char_count"],
                    "chunk_count": r["chunk_count"],
                    "extraction_warnings": warnings,
                    "ocr_used": bool(r["ocr_used"]),
                    "created_at": r["created_at"],
                    "updated_at": r["updated_at"],
                })

        return docs

    @staticmethod
    async def get_document(doc_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves single document metadata and processing coverage details."""
        async with get_db_connection() as db:
            async with db.execute("""
                SELECT id, session_id, filename, file_type, file_size, storage_path,
                       status, page_count, extracted_char_count, chunk_count,
                       extraction_warnings, ocr_used, created_at, updated_at
                FROM documents WHERE id = ?
            """, (doc_id,)) as cursor:
                row = await cursor.fetchone()
                if not row:
                    return None

                warnings = []
                if row["extraction_warnings"]:
                    try:
                        warnings = json.loads(row["extraction_warnings"])
                    except Exception:
                        warnings = [row["extraction_warnings"]]

                return {
                    "id": row["id"],
                    "session_id": row["session_id"],
                    "filename": row["filename"],
                    "file_type": row["file_type"],
                    "file_size": row["file_size"],
                    "storage_path": row["storage_path"],
                    "status": row["status"],
                    "page_count": row["page_count"],
                    "extracted_char_count": row["extracted_char_count"],
                    "chunk_count": row["chunk_count"],
                    "extraction_warnings": warnings,
                    "ocr_used": bool(row["ocr_used"]),
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                }

    @staticmethod
    async def delete_document(doc_id: str) -> bool:
        """Removes document, indexed chunks, FTS entries, summaries, and physical storage file."""
        doc = await DocumentService.get_document(doc_id)
        if not doc:
            return False

        # 1. Delete physical file
        try:
            stored_file = Path(doc["storage_path"])
            if stored_file.exists():
                stored_file.unlink()
        except Exception as e:
            logger.warning(f"Could not delete physical document file {doc.get('storage_path')}: {e}")

        # 2. Remove DB rows (Cascades will delete chunks, fts, summaries)
        async with get_db_connection() as db:
            await db.execute("DELETE FROM document_chunks_fts WHERE document_id = ?", (doc_id,))
            await db.execute("DELETE FROM document_summaries WHERE document_id = ?", (doc_id,))
            await db.execute("DELETE FROM document_chunks WHERE document_id = ?", (doc_id,))
            await db.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
            await db.commit()

        return True
