"""Chat Sessions and SSE Streaming router."""

from datetime import datetime, timezone
import json
from typing import AsyncGenerator, List, Optional
import uuid
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.config import settings
from app.database import get_db_connection, get_setting
from app.schemas import (
    ChatMessage,
    ChatMessageRequest,
    ChatSession,
    ChatSessionCreate,
)
from app.services.agent import build_system_prompt, process_model_actions
from app.services.ollama_client import ollama_client

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("/sessions", response_model=ChatSession)
async def create_chat_session(req: ChatSessionCreate):
    """Creates a new chat session."""
    session_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    workspace = req.workspace_path or await get_setting("active_workspace", settings.ACTIVE_WORKSPACE)

    async with get_db_connection() as db:
        await db.execute("""
            INSERT INTO sessions (id, title, workspace_path, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
        """, (session_id, req.title or "New Session", workspace, now_iso, now_iso))
        await db.commit()

    return ChatSession(
        id=session_id,
        title=req.title or "New Session",
        workspace_path=workspace,
        created_at=now_iso,
        updated_at=now_iso,
        message_count=0,
    )


@router.get("/sessions", response_model=List[ChatSession])
async def list_chat_sessions():
    """Lists all chat sessions ordered by most recently updated."""
    sessions: List[ChatSession] = []
    async with get_db_connection() as db:
        async with db.execute("""
            SELECT s.id, s.title, s.workspace_path, s.created_at, s.updated_at,
                   COUNT(m.id) as message_count
            FROM sessions s
            LEFT JOIN messages m ON s.id = m.session_id
            GROUP BY s.id
            ORDER BY s.updated_at DESC
        """) as cursor:
            rows = await cursor.fetchall()
            for r in rows:
                sessions.append(
                    ChatSession(
                        id=r["id"],
                        title=r["title"],
                        workspace_path=r["workspace_path"],
                        created_at=r["created_at"],
                        updated_at=r["updated_at"],
                        message_count=r["message_count"],
                    )
                )
    return sessions


@router.get("/sessions/{session_id}/messages", response_model=List[ChatMessage])
async def get_session_messages(session_id: str):
    """Retrieves all messages for a specific chat session."""
    messages: List[ChatMessage] = []
    async with get_db_connection() as db:
        async with db.execute("""
            SELECT id, session_id, role, content, tool_calls, tool_results, created_at
            FROM messages
            WHERE session_id = ?
            ORDER BY created_at ASC
        """, (session_id,)) as cursor:
            rows = await cursor.fetchall()
            for r in rows:
                tc = json.loads(r["tool_calls"]) if r["tool_calls"] else None
                tr = json.loads(r["tool_results"]) if r["tool_results"] else None
                messages.append(
                    ChatMessage(
                        id=r["id"],
                        session_id=r["session_id"],
                        role=r["role"],
                        content=r["content"],
                        tool_calls=tc,
                        tool_results=tr,
                        created_at=r["created_at"],
                    )
                )
    return messages


@router.delete("/sessions/{session_id}")
async def delete_chat_session(session_id: str):
    """Deletes a chat session and its associated messages."""
    async with get_db_connection() as db:
        await db.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
        await db.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        await db.commit()
    return {"status": "success", "deleted_session_id": session_id}


async def _save_message(
    session_id: str, 
    role: str, 
    content: str, 
    tool_calls: Optional[Any] = None,
    tool_results: Optional[Any] = None
) -> ChatMessage:
    """Helper to persist a message to SQLite."""
    msg_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    tc_json = json.dumps(tool_calls) if tool_calls else None
    tr_json = json.dumps(tool_results) if tool_results else None

    async with get_db_connection() as db:
        await db.execute("""
            INSERT INTO messages (id, session_id, role, content, tool_calls, tool_results, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (msg_id, session_id, role, content, tc_json, tr_json, now_iso))
        await db.execute("""
            UPDATE sessions SET updated_at = ? WHERE id = ?
        """, (now_iso, session_id))
        await db.commit()

    return ChatMessage(
        id=msg_id,
        session_id=session_id,
        role=role,
        content=content,
        tool_calls=tool_calls,
        tool_results=tool_results,
        created_at=now_iso,
    )


@router.post("/send")
async def send_message_non_streaming(req: ChatMessageRequest):
    """Non-streaming message endpoint for testing and single-turn completions."""
    workspace = await get_setting("active_workspace", settings.ACTIVE_WORKSPACE)
    session_id = req.session_id

    # Create session if not provided
    if not session_id:
        sess = await create_chat_session(ChatSessionCreate(
            title=req.content[:30] + ("..." if len(req.content) > 30 else ""),
            workspace_path=workspace,
        ))
        session_id = sess.id

    # Persist user message
    await _save_message(session_id, "user", req.content)

    # Fetch prior history
    history = await get_session_messages(session_id)
    
    # Build prompt messages for Ollama
    system_prompt = build_system_prompt(
        workspace_path=workspace,
        current_file_path=req.current_file_path,
        selected_code=req.selected_code,
        mode=req.mode or "chat",
    )

    ollama_messages = [{"role": "system", "content": system_prompt}]
    for m in history:
        if m.role in ("user", "assistant"):
            ollama_messages.append({"role": m.role, "content": m.content})

    # Call Ollama
    model = req.model or await get_setting("default_model", settings.DEFAULT_MODEL)
    result = await ollama_client.chat_complete(ollama_messages, model=model)
    assistant_content = result.get("message", {}).get("content", "")

    # Check for proposed actions (creates approvals in DB)
    created_approvals = await process_model_actions(assistant_content, session_id, workspace)

    # Persist assistant response
    saved_assistant = await _save_message(
        session_id=session_id,
        role="assistant",
        content=assistant_content,
        tool_calls=created_approvals if created_approvals else None,
    )

    return {
        "message": saved_assistant,
        "approvals": created_approvals,
    }


@router.post("/stream")
async def stream_chat_message(req: ChatMessageRequest):
    """Server-Sent Events (SSE) streaming chat endpoint with real-time token delivery."""
    workspace = await get_setting("active_workspace", settings.ACTIVE_WORKSPACE)
    session_id = req.session_id

    if not session_id:
        sess = await create_chat_session(ChatSessionCreate(
            title=req.content[:30] + ("..." if len(req.content) > 30 else ""),
            workspace_path=workspace,
        ))
        session_id = sess.id

    # Save user message
    await _save_message(session_id, "user", req.content)

    # Fetch prior history
    history = await get_session_messages(session_id)

    system_prompt = build_system_prompt(
        workspace_path=workspace,
        current_file_path=req.current_file_path,
        selected_code=req.selected_code,
        mode=req.mode or "chat",
    )

    ollama_messages = [{"role": "system", "content": system_prompt}]
    for m in history:
        if m.role in ("user", "assistant"):
            ollama_messages.append({"role": m.role, "content": m.content})

    model = req.model or await get_setting("default_model", settings.DEFAULT_MODEL)

    async def event_generator() -> AsyncGenerator[str, None]:
        # Send initial event with session_id
        yield f"event: init\ndata: {json.dumps({'session_id': session_id})}\n\n"

        full_content_acc = []
        try:
            async for raw_line in ollama_client.chat_stream(ollama_messages, model=model):
                try:
                    data = json.loads(raw_line)
                    chunk = data.get("message", {}).get("content", "")
                    if chunk:
                        full_content_acc.append(chunk)
                        yield f"event: chunk\ndata: {json.dumps({'chunk': chunk})}\n\n"
                    if data.get("done", False):
                        break
                except Exception:
                    continue

            full_text = "".join(full_content_acc)

            # Check if model proposed file changes or commands
            created_approvals = await process_model_actions(full_text, session_id, workspace)
            if created_approvals:
                yield f"event: approvals\ndata: {json.dumps({'approvals': created_approvals})}\n\n"

            # Save completed assistant message
            saved_msg = await _save_message(
                session_id=session_id,
                role="assistant",
                content=full_text,
                tool_calls=created_approvals if created_approvals else None,
            )

            yield f"event: done\ndata: {json.dumps({'message_id': saved_msg.id, 'session_id': session_id})}\n\n"

        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
