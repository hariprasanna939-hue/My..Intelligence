"""Document Upload, Management, Q&A, and Summarization Router."""

import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from app.schemas import (
    DocumentMetadata,
    DocumentQuestionRequest,
    DocumentQuestionResponse,
    DocumentSummaryRequest,
    DocumentSummaryResponse,
)
from app.services.document_service import DocumentService
from app.services.document_qa import DocumentQAService
from app.services.document_summarizer import DocumentSummarizerService

logger = logging.getLogger("forgelocal.routers.documents")
router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.post("/upload", response_model=DocumentMetadata)
async def upload_document(
    file: UploadFile = File(...),
    session_id: Optional[str] = Form(None),
):
    """Uploads, validates, extracts, chunks, and indexes an offline document."""
    try:
        content = await file.read()
        doc = await DocumentService.process_document_upload(
            file_bytes=content,
            original_filename=file.filename or "uploaded_document",
            session_id=session_id,
        )
        return doc
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected document upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Internal document processing error: {str(e)}")


@router.get("", response_model=List[DocumentMetadata])
async def list_documents(
    session_id: Optional[str] = Query(None, description="Optional conversation session ID filter"),
):
    """Lists uploaded documents with processing status and extraction coverage."""
    return await DocumentService.list_documents_for_session(session_id)


@router.get("/{document_id}", response_model=DocumentMetadata)
async def get_document(document_id: str):
    """Retrieves document metadata, page coverage, and extraction warnings."""
    doc = await DocumentService.get_document(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    return doc


@router.delete("/{document_id}")
async def delete_document(document_id: str):
    """Deletes a document and all derived chunks, FTS index entries, and summaries."""
    success = await DocumentService.delete_document(document_id)
    if not success:
        raise HTTPException(status_code=404, detail="Document not found.")
    return {"status": "deleted", "id": document_id}


@router.post("/qa", response_model=DocumentQuestionResponse)
async def answer_document_question(req: DocumentQuestionRequest):
    """Answers a user question grounded in retrieved document chunks with citations."""
    try:
        res = await DocumentQAService.answer_question(
            question=req.question,
            document_ids=req.document_ids,
            session_id=req.session_id,
            model=req.model,
            limit_chunks=req.limit_chunks,
        )
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error answering document question: {e}")
        raise HTTPException(status_code=500, detail=f"QA generation error: {str(e)}")


@router.post("/summarize", response_model=DocumentSummaryResponse)
async def summarize_document(req: DocumentSummaryRequest):
    """Generates complete multi-level summaries of an uploaded document."""
    try:
        res = await DocumentSummarizerService.summarize_document(
            document_id=req.document_id,
            summary_type=req.summary_type,
            model=req.model,
        )
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error generating document summary: {e}")
        raise HTTPException(status_code=500, detail=f"Summarization error: {str(e)}")
