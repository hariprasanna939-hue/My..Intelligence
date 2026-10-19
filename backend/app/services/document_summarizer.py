"""Document Summarization Module for ForgeLocal.

Supports:
- Quick Summary
- Detailed Summary
- Section-by-Section Summary
- Key Points
- Important Dates and Deadlines
- Risks and Limitations
- Action Items
- Questions and Answers

Uses hierarchical summarization for long documents to ensure all chunks
are covered without truncation or context overflow.
"""

import logging
from typing import Any, Dict, List, Optional
import uuid

from app.config import settings
from app.database import get_db_connection
from app.services.document_index import get_all_chunks_for_document, search_document_chunks
from app.services.ollama_client import ollama_client

logger = logging.getLogger("forgelocal.documents.summarizer")

SUMMARY_TYPE_INSTRUCTIONS = {
    "quick": "Provide a high-level executive summary of this document in 2-3 concise paragraphs.",
    "detailed": "Provide a comprehensive, detailed summary covering all major sections, findings, and arguments in depth.",
    "key_points": "Extract all key bullet points, critical insights, and central takeaways from the document.",
    "dates_deadlines": "Identify and list every single important date, deadline, milestone, and timeline mentioned in the document with page/section context.",
    "risks_limitations": "Identify all risks, drawbacks, limitations, assumptions, and caveat notices expressed in the document.",
    "action_items": "Extract an actionable checklist of tasks, next steps, assignments, or requirements mentioned in the document.",
    "qa": "Formulate the top 5-10 essential questions answered by this document, along with concise, grounded answers.",
    "section_by_section": "Provide a structured section-by-section breakdown of the document in sequence.",
}


class DocumentSummarizerService:
    """Produces multi-level, complete summaries for uploaded documents."""

    @staticmethod
    async def summarize_document(
        document_id: str,
        summary_type: str = "quick",
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Summarizes a document completely, using hierarchical aggregation if long."""
        norm_type = summary_type.lower().strip()
        instruction = SUMMARY_TYPE_INSTRUCTIONS.get(norm_type, SUMMARY_TYPE_INSTRUCTIONS["quick"])

        # 1. Check if summary is already cached
        async with get_db_connection() as db:
            async with db.execute("""
                SELECT summary_text FROM document_summaries 
                WHERE document_id = ? AND summary_type = ?
                LIMIT 1
            """, (document_id, norm_type)) as cursor:
                cached = await cursor.fetchone()
                if cached:
                    return {
                        "document_id": document_id,
                        "summary_type": norm_type,
                        "summary": cached["summary_text"],
                        "cached": True,
                        "chunks_analyzed": "cached",
                    }

        # 2. Retrieve all chunks in order
        all_chunks = await get_all_chunks_for_document(document_id)
        if not all_chunks:
            return {
                "document_id": document_id,
                "summary_type": norm_type,
                "summary": "No extracted text or chunks found for this document.",
                "cached": False,
                "chunks_analyzed": 0,
            }

        active_model = model or settings.DEFAULT_MODEL
        total_chunks = len(all_chunks)

        # 3. Short document path (fits within context safely: <= 4 chunks)
        if total_chunks <= 4:
            combined_text = "\n\n".join(
                f"[{ch.citation()}]\n{ch.content}" for ch in all_chunks
            )
            prompt = f"""DOCUMENT CONTENT:
{combined_text}

TASK:
{instruction}

Ensure that no important sections or conclusions are omitted. Maintain full factual fidelity and cite relevant pages or sections."""

            messages = [
                {"role": "system", "content": "You are a professional research analyst summarizing user documents accurately without hallucinations."},
                {"role": "user", "content": prompt},
            ]

            resp = await ollama_client.chat_complete(
                messages,
                model=active_model,
                temperature=0.2,
                num_ctx=settings.DEFAULT_NUM_CTX,
            )
            final_summary = resp.get("message", {}).get("content", "")

        else:
            # 4. Hierarchical summarization for long documents
            # Process in groups of 4 chunks, then synthesize the interim summaries
            interim_summaries: List[str] = []
            group_size = 4

            for i in range(0, total_chunks, group_size):
                group_chunks = all_chunks[i:i + group_size]
                group_text = "\n\n".join(
                    f"[{ch.citation()}]\n{ch.content}" for ch in group_chunks
                )
                chunk_prompt = f"""DOCUMENT SEGMENT (Chunks {i+1} to {min(i+group_size, total_chunks)} of {total_chunks}):
{group_text}

Summarize this segment while preserving all key facts, statistics, dates, and conclusions."""

                c_messages = [
                    {"role": "system", "content": "You are extracting key points from a document segment."},
                    {"role": "user", "content": chunk_prompt},
                ]

                try:
                    c_resp = await ollama_client.chat_complete(
                        c_messages,
                        model=active_model,
                        temperature=0.1,
                        num_ctx=settings.DEFAULT_NUM_CTX,
                    )
                    interim_summaries.append(c_resp.get("message", {}).get("content", ""))
                except Exception as e:
                    logger.warning(f"Error in hierarchical chunk summary: {e}")

            # Final synthesis step
            synthesis_input = "\n\n=== SECTION SUMMARY ===\n".join(interim_summaries)
            synthesis_prompt = f"""AGGREGATED SEGMENT SUMMARIES (Covers 100% of the document):
{synthesis_input}

OVERALL TASK:
{instruction}

Synthesize these segment summaries into a coherent final document summary matching the requested format. Do not skip any sections."""

            final_messages = [
                {"role": "system", "content": "You are finalizing a comprehensive document summary based on all segment summaries."},
                {"role": "user", "content": synthesis_prompt},
            ]

            final_resp = await ollama_client.chat_complete(
                final_messages,
                model=active_model,
                temperature=0.2,
                num_ctx=settings.DEFAULT_NUM_CTX,
            )
            final_summary = final_resp.get("message", {}).get("content", "")

        # 5. Cache summary into database
        summary_id = str(uuid.uuid4())
        async with get_db_connection() as db:
            await db.execute("""
                INSERT INTO document_summaries (id, document_id, summary_type, summary_text)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET summary_text = excluded.summary_text
            """, (summary_id, document_id, norm_type, final_summary))
            await db.commit()

        return {
            "document_id": document_id,
            "summary_type": norm_type,
            "summary": final_summary,
            "cached": False,
            "chunks_analyzed": total_chunks,
        }
