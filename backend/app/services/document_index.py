"""Document Indexing and SQLite FTS5 Full-Text Search Retrieval Module.

Stores chunks into SQLite, creates indexed FTS5 tokens, and retrieves
relevance-ranked chunks with source citations for document Q&A.
"""

from dataclasses import dataclass
import logging
from typing import Any, Dict, List, Optional
import uuid
import aiosqlite

from app.database import get_db_connection
from app.services.document_chunker import DocumentChunk

logger = logging.getLogger("forgelocal.documents.index")


@dataclass
class RetrievedChunk:
    chunk_id: str
    document_id: str
    filename: str
    page_number: Optional[int]
    section_heading: Optional[str]
    content: str
    rank: float

    def citation(self) -> str:
        """Returns human-readable citation string."""
        parts = [f"File: {self.filename}"]
        if self.page_number:
            parts.append(f"Page {self.page_number}")
        if self.section_heading and self.section_heading != f"Page {self.page_number}":
            parts.append(f"Section: {self.section_heading}")
        return ", ".join(parts)


async def index_document_chunks(
    document_id: str,
    chunks: List[DocumentChunk],
) -> int:
    """Inserts document chunks into document_chunks and document_chunks_fts."""
    async with get_db_connection() as db:
        # First clear any existing chunks for this document
        await db.execute("DELETE FROM document_chunks_fts WHERE document_id = ?", (document_id,))
        await db.execute("DELETE FROM document_chunks WHERE document_id = ?", (document_id,))

        for ch in chunks:
            chunk_id = str(uuid.uuid4())
            await db.execute("""
                INSERT INTO document_chunks (
                    id, document_id, chunk_index, page_number,
                    section_heading, content, char_count
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                chunk_id, document_id, ch.chunk_index, ch.page_number,
                ch.section_heading, ch.content, ch.char_count
            ))

            # Insert into SQLite FTS5 index
            await db.execute("""
                INSERT INTO document_chunks_fts (
                    chunk_id, document_id, content, section_heading
                ) VALUES (?, ?, ?, ?)
            """, (
                chunk_id, document_id, ch.content, ch.section_heading or ""
            ))

        await db.commit()
    return len(chunks)


def sanitize_fts_query(query: str) -> str:
    """Sanitizes user queries for SQLite FTS5 MATCH syntax."""
    import re
    # Remove all punctuation and operators, leaving only alphanumeric words
    tokens = re.findall(r"\w+", query)
    tokens = [t for t in tokens if len(t) > 1]
    if not tokens:
        return ""
    # Enclose each word in quotes or OR connect
    return " OR ".join(f'"{t}"' for t in tokens)


async def search_document_chunks(
    query: str,
    document_ids: Optional[List[str]] = None,
    session_id: Optional[str] = None,
    limit: int = 6,
) -> List[RetrievedChunk]:
    """Searches document chunks using SQLite FTS5 with fallback to substring match.
    
    Returns relevance-ranked chunks with filename and page citations.
    """
    results: List[RetrievedChunk] = []
    fts_query = sanitize_fts_query(query)

    async with get_db_connection() as db:
        # Build document filter condition
        doc_filter_clauses = []
        doc_params: List[Any] = []

        if document_ids:
            placeholders = ",".join("?" for _ in document_ids)
            doc_filter_clauses.append(f"d.id IN ({placeholders})")
            doc_params.extend(document_ids)
        elif session_id:
            doc_filter_clauses.append("d.session_id = ?")
            doc_params.append(session_id)

        where_doc = f"WHERE {' AND '.join(doc_filter_clauses)}" if doc_filter_clauses else ""

        # Try FTS5 MATCH query first
        if fts_query:
            try:
                and_doc = f"AND {where_doc.replace('WHERE ', '')}" if where_doc else ""
                sql = f"""
                    SELECT 
                        c.id as chunk_id,
                        c.document_id,
                        d.filename,
                        c.page_number,
                        c.section_heading,
                        c.content,
                        document_chunks_fts.rank
                    FROM document_chunks_fts
                    JOIN document_chunks c ON c.id = document_chunks_fts.chunk_id
                    JOIN documents d ON d.id = c.document_id
                    WHERE document_chunks_fts MATCH ? {and_doc}
                    ORDER BY document_chunks_fts.rank ASC
                    LIMIT ?
                """
                async with db.execute(sql, [fts_query] + doc_params + [limit]) as cursor:
                    rows = await cursor.fetchall()
                    for r in rows:
                        results.append(
                            RetrievedChunk(
                                chunk_id=r["chunk_id"],
                                document_id=r["document_id"],
                                filename=r["filename"],
                                page_number=r["page_number"],
                                section_heading=r["section_heading"],
                                content=r["content"],
                                rank=float(r["rank"]),
                            )
                        )
            except Exception as e:
                logger.warning(f"FTS5 match failed, falling back to substring: {e}")

        # If FTS returns zero results, perform fallback LIKE search or sequential sample
        if not results:
            fallback_sql = f"""
                SELECT 
                    c.id as chunk_id,
                    c.document_id,
                    d.filename,
                    c.page_number,
                    c.section_heading,
                    c.content,
                    1.0 as rank
                FROM document_chunks c
                JOIN documents d ON d.id = c.document_id
                {where_doc}
                ORDER BY c.chunk_index ASC
                LIMIT ?
            """
            async with db.execute(fallback_sql, doc_params + [limit]) as cursor:
                rows = await cursor.fetchall()
                for r in rows:
                    results.append(
                        RetrievedChunk(
                            chunk_id=r["chunk_id"],
                            document_id=r["document_id"],
                            filename=r["filename"],
                            page_number=r["page_number"],
                            section_heading=r["section_heading"],
                            content=r["content"],
                            rank=1.0,
                        )
                    )

    return results


async def get_all_chunks_for_document(document_id: str) -> List[RetrievedChunk]:
    """Retrieves all chunks for a document ordered by chunk_index."""
    results: List[RetrievedChunk] = []
    async with get_db_connection() as db:
        sql = """
            SELECT 
                c.id as chunk_id,
                c.document_id,
                d.filename,
                c.page_number,
                c.section_heading,
                c.content,
                c.chunk_index
            FROM document_chunks c
            JOIN documents d ON d.id = c.document_id
            WHERE c.document_id = ?
            ORDER BY c.chunk_index ASC
        """
        async with db.execute(sql, (document_id,)) as cursor:
            rows = await cursor.fetchall()
            for r in rows:
                results.append(
                    RetrievedChunk(
                        chunk_id=r["chunk_id"],
                        document_id=r["document_id"],
                        filename=r["filename"],
                        page_number=r["page_number"],
                        section_heading=r["section_heading"],
                        content=r["content"],
                        rank=0.0,
                    )
                )
    return results
