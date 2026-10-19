"""Tests for ForgeLocal Offline Document Processing, Extraction, Indexing, Q&A, and Summarization."""

import io
import json
import os
from pathlib import Path
import pytest
import docx
from pypdf import PdfWriter
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.config import settings
from app.database import get_db_connection
from app.services.document_extractors import (
    extract_document,
    extract_text,
    extract_json,
    extract_csv,
    extract_docx,
    extract_pdf,
    is_tesseract_available,
)
from app.services.document_chunker import chunk_extracted_pages
from app.services.document_index import index_document_chunks, search_document_chunks
from app.services.document_service import DocumentService


def create_sample_docx(path: Path):
    doc = docx.Document()
    doc.add_heading("Project Overview", level=1)
    doc.add_paragraph("ForgeLocal is a self-hosted offline AI coding assistant.")
    doc.add_heading("Architecture Details", level=2)
    doc.add_paragraph("It utilizes FastAPI for the backend and React for the frontend interface.")
    table = doc.add_table(rows=2, cols=2)
    table.cell(0, 0).text = "Component"
    table.cell(0, 1).text = "Technology"
    table.cell(1, 0).text = "Model Runtime"
    table.cell(1, 1).text = "Ollama Local"
    doc.save(str(path))


def create_sample_pdf(path: Path):
    # pypdf can create a blank/minimal valid PDF structure
    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    with open(path, "wb") as f:
        writer.write(f)


@pytest.mark.asyncio
async def test_txt_and_code_extraction(tmp_path: Path):
    code_file = tmp_path / "sample.py"
    code_file.write_text("def hello_forge():\n    return 'offline agent'\n", encoding="utf-8")
    
    res = extract_text(code_file)
    assert res.total_pages_detected == 1
    assert "def hello_forge():" in res.pages[0].content
    assert res.pages[0].section_heading == "sample.py"


@pytest.mark.asyncio
async def test_json_and_csv_extraction(tmp_path: Path):
    # Test JSON
    json_file = tmp_path / "config.json"
    json_data = {"agent": "ForgeLocal", "offline": True, "limits": {"max_tokens": 4096}}
    json_file.write_text(json.dumps(json_data), encoding="utf-8")

    json_res = extract_json(json_file)
    assert json_res.total_pages_detected == 1
    assert '"agent": "ForgeLocal"' in json_res.pages[0].content

    # Test CSV
    csv_file = tmp_path / "data.csv"
    csv_file.write_text("id,name,role\n1,Alice,Engineer\n2,Bob,Architect\n", encoding="utf-8")

    csv_res = extract_csv(csv_file)
    assert csv_res.total_pages_detected == 1
    assert "Alice" in csv_res.pages[0].content
    assert "Architect" in csv_res.pages[0].content


@pytest.mark.asyncio
async def test_docx_extraction(tmp_path: Path):
    docx_file = tmp_path / "specs.docx"
    create_sample_docx(docx_file)

    res = extract_docx(docx_file)
    assert len(res.pages) > 0
    full_text = " ".join(p.content for p in res.pages)
    assert "ForgeLocal is a self-hosted offline AI coding assistant" in full_text
    assert "Architecture Details" in full_text
    assert "Model Runtime" in full_text


@pytest.mark.asyncio
async def test_chunker_boundaries_and_overlap():
    from app.services.document_extractors import ExtractedPage

    pages = [
        ExtractedPage(page_number=1, section_heading="Intro", content="First sentence in page 1. Second sentence here. Third sentence follows."),
        ExtractedPage(page_number=2, section_heading="Details", content="Fourth sentence in page 2. Fifth sentence follows."),
    ]

    chunks = chunk_extracted_pages(pages, chunk_size=40, chunk_overlap=10)
    assert len(chunks) >= 2
    assert chunks[0].page_number == 1
    assert chunks[0].section_heading == "Intro"
    # Ensure chunk ids are properly sequenced
    assert chunks[0].chunk_index == 0
    assert chunks[1].chunk_index == 1


@pytest.mark.asyncio
async def test_document_indexing_and_fts_search():
    doc_id = "test-doc-123"
    from app.services.document_chunker import DocumentChunk

    chunks = [
        DocumentChunk(
            chunk_index=0,
            page_number=1,
            section_heading="Overview",
            content="Antigravity offline coding agent provides robust SQLite full-text search capabilities.",
            char_count=85
        ),
        DocumentChunk(
            chunk_index=1,
            page_number=2,
            section_heading="Hardware",
            content="Local models like Qwen2.5-Coder run smoothly without requiring cloud connectivity.",
            char_count=84
        ),
    ]

    # Insert parent document row to satisfy foreign key constraint
    async with get_db_connection() as db:
        await db.execute("""
            INSERT OR REPLACE INTO documents (
                id, filename, file_type, file_size, storage_path, status
            ) VALUES (?, 'sample.txt', '.txt', 100, '/tmp/sample.txt', 'ready')
        """, (doc_id,))
        await db.commit()

    # Index chunks
    indexed_count = await index_document_chunks(doc_id, chunks)
    assert indexed_count == 2

    # Query matches chunk 0
    results = await search_document_chunks("Antigravity SQLite", document_ids=[doc_id], limit=5)
    assert len(results) > 0
    assert "SQLite full-text search" in results[0].content
    assert results[0].page_number == 1

    # Query matches chunk 1
    results2 = await search_document_chunks("Qwen2.5-Coder connectivity", document_ids=[doc_id], limit=5)
    assert len(results2) > 0
    assert "Qwen2.5-Coder" in results2[0].content
    assert results2[0].page_number == 2

    # Cleanup
    async with get_db_connection() as db:
        await db.execute("DELETE FROM document_chunks WHERE document_id = ?", (doc_id,))
        await db.execute("DELETE FROM document_chunks_fts WHERE document_id = ?", (doc_id,))
        await db.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
        await db.commit()


@pytest.mark.asyncio
async def test_document_service_validation_and_lifecycle(tmp_path: Path):
    # Test file extension validation
    with pytest.raises(ValueError, match="Unsupported document format"):
        await DocumentService.process_document_upload(
            file_bytes=b"binary content",
            original_filename="malicious.exe"
        )

    # Test file size limit validation
    large_payload = b"X" * (settings.MAX_UPLOAD_FILE_SIZE_BYTES + 1024)
    with pytest.raises(ValueError, match="File size exceeds maximum allowed upload limit"):
        await DocumentService.process_document_upload(
            file_bytes=large_payload,
            original_filename="big.txt"
        )

    # Test successful text file lifecycle
    sample_content = (
        "Offline AI Agent Documentation\n\n"
        "Section 1: Architecture\n"
        "ForgeLocal runs completely offline using local models with Ollama.\n\n"
        "Section 2: Security\n"
        "All filesystem accesses are sandboxed and require user approvals for changes.\n"
    ).encode("utf-8")

    doc = await DocumentService.process_document_upload(
        original_filename="AgentDoc.txt",
        file_bytes=sample_content,
        session_id="session-test-doc"
    )

    doc_id = doc["id"]
    assert doc["status"] == "ready"
    assert doc["chunk_count"] > 0
    assert doc["filename"] == "AgentDoc.txt"

    # Verify retrieval
    fetched = await DocumentService.get_document(doc_id)
    assert fetched is not None
    assert fetched["id"] == doc_id
    assert fetched["file_size"] == len(sample_content)

    # Verify listing
    listed = await DocumentService.list_documents_for_session(session_id="session-test-doc")
    assert any(d["id"] == doc_id for d in listed)

    # Verify deletion
    deleted = await DocumentService.delete_document(doc_id)
    assert deleted is True

    # Confirm it's gone
    assert await DocumentService.get_document(doc_id) is None


@pytest.mark.asyncio
async def test_document_endpoints_via_api():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Upload file via multipart
        file_data = b"Title: Machine Learning Offline\n\nContent: Local inference preserves absolute privacy."
        files = {
            "file": ("notes.txt", io.BytesIO(file_data), "text/plain")
        }
        res = await client.post("/api/documents/upload", files=files, data={"session_id": "test-session-api"})
        assert res.status_code == 200
        meta = res.json()
        doc_id = meta["id"]
        assert meta["filename"] == "notes.txt"
        assert meta["status"] == "ready"

        # 2. List documents
        res_list = await client.get("/api/documents?session_id=test-session-api")
        assert res_list.status_code == 200
        assert any(d["id"] == doc_id for d in res_list.json())

        # 3. Get single document
        res_single = await client.get(f"/api/documents/{doc_id}")
        assert res_single.status_code == 200
        assert res_single.json()["id"] == doc_id

        # 4. Ask QA question (with Ollama mock or real client)
        qa_req = {
            "document_id": doc_id,
            "question": "What does local inference preserve?",
            "model": "qwen2.5-coder:7b"
        }
        res_qa = await client.post("/api/documents/qa", json=qa_req)
        # Should return 200 (or if Ollama is running, with factual answer; if Ollama down, still returns structured response)
        assert res_qa.status_code == 200
        qa_data = res_qa.json()
        assert "citations" in qa_data
        assert len(qa_data["citations"]) > 0

        # 5. Summarize endpoint
        sum_req = {
            "document_id": doc_id,
            "summary_type": "quick",
            "model": "qwen2.5-coder:7b"
        }
        res_sum = await client.post("/api/documents/summarize", json=sum_req)
        assert res_sum.status_code == 200
        sum_data = res_sum.json()
        assert sum_data["summary_type"] == "quick"
        assert "summary" in sum_data

        # 6. Delete document
        res_del = await client.delete(f"/api/documents/{doc_id}")
        assert res_del.status_code == 200
        assert res_del.json()["status"] == "deleted"
