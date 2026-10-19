"""Chat Sessions and SSE Streaming router."""

from datetime import datetime, timezone
import json
import logging
from typing import Any, AsyncGenerator, Dict, List, Optional
import uuid
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from app.config import settings
from app.database import (
    clear_all_history,
    get_db_connection,
    get_setting,
    get_task_plans_for_session,
    save_task_plan,
)
from app.schemas import (
    ChatMessage,
    ChatMessageRequest,
    ChatSession,
    ChatSessionCreate,
)
from app.services.agent import (
    MAX_AGENT_ITERATIONS,
    build_system_prompt,
    extract_actions,
    generate_task_plan,
    process_model_actions,
)
from app.services.agent_tools import agent_tools
from app.services.ollama_client import ollama_client

logger = logging.getLogger("forgelocal.chat")
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


@router.delete("/history")
async def clear_chat_history():
    """Wipes all sessions, messages, approvals, task plans, test executions, and backups."""
    result = await clear_all_history()
    return {"status": "success", "cleared": result}


@router.get("/sessions/{session_id}/plans")
async def get_session_plans(session_id: str):
    """Retrieves all bounded task plans recorded for a chat session."""
    return await get_task_plans_for_session(session_id)



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
    """Non-streaming message endpoint with validation, SQLite persistence, and bounded agent loop."""
    if not req.content or not req.content.strip():
        raise HTTPException(status_code=400, detail="Message content cannot be empty.")

    workspace = req.workspace_path or await get_setting("active_workspace", settings.ACTIVE_WORKSPACE)
    session_id = req.session_id

    # Create session if not provided
    if not session_id:
        sess = await create_chat_session(ChatSessionCreate(
            title=req.content[:30] + ("..." if len(req.content) > 30 else ""),
            workspace_path=workspace,
        ))
        session_id = sess.id

    # Persist user message
    await _save_message(session_id, "user", req.content.strip())

    # Create & persist initial task plan
    steps = generate_task_plan(req.content.strip(), req.mode or "chat")
    plan_id = str(uuid.uuid4())
    await save_task_plan(plan_id, session_id, req.content.strip(), steps, "in_progress")

    # Fetch prior history
    history = await get_session_messages(session_id)
    
    # Retrieve relevant uploaded document excerpts if available
    doc_context = ""
    try:
        from app.services.document_index import search_document_chunks
        doc_chunks = await search_document_chunks(query=req.content.strip(), session_id=session_id, limit=4)
        if doc_chunks:
            excerpts = []
            for ch in doc_chunks:
                excerpts.append(f"[{ch.citation()}]\n{ch.content}")
            doc_context = "\n\nATTACHED DOCUMENT EXCERPTS (Primary Grounding Evidence):\n" + "\n---\n".join(excerpts) + "\n"
    except Exception as e:
        logger.warning(f"Could not retrieve document context: {e}")

    # Build prompt messages for Ollama with automated project context gathering
    system_prompt = build_system_prompt(
        workspace_path=workspace,
        current_file_path=req.current_file_path,
        selected_code=req.selected_code,
        mode=req.mode or "chat",
        user_prompt=req.content.strip(),
    )
    if doc_context:
        system_prompt += f"\n\n{doc_context}\nCRITICAL DOCUMENT RULE: Use the attached document excerpts above as primary evidence. Never hallucinate facts or citations. Cite the page/file when stating facts."

    ollama_messages = [{"role": "system", "content": system_prompt}]
    for m in history:
        if m.role in ("user", "assistant"):
            ollama_messages.append({"role": m.role, "content": m.content})

    # Read generation settings
    model = req.model or await get_setting("default_model", settings.DEFAULT_MODEL)
    temp = req.temperature if req.temperature is not None else float(await get_setting("temperature", str(settings.DEFAULT_TEMPERATURE)))
    ctx = req.num_ctx if req.num_ctx is not None else int(await get_setting("num_ctx", str(settings.DEFAULT_NUM_CTX)))
    predict = req.num_predict if req.num_predict is not None else int(await get_setting("num_predict", str(settings.DEFAULT_NUM_PREDICT)))

    all_approvals = []
    previous_tool_signatures = set()
    total_assistant_parts = []

    for iteration in range(1, MAX_AGENT_ITERATIONS + 1):
        result = await ollama_client.chat_complete(
            ollama_messages,
            model=model,
            temperature=temp,
            num_ctx=ctx,
            num_predict=predict,
        )
        assistant_content = result.get("message", {}).get("content", "")
        total_assistant_parts.append(assistant_content)

        actions = extract_actions(assistant_content)
        if not actions:
            break

        # Check for modification actions requiring approval
        has_modifications = any(
            act.get("action") in (
                "propose_file_write", "propose_file_edit", "propose_new_file",
                "generate_patch", "propose_command", "propose_test_command"
            ) or (agent_tools.get_tool(act.get("action")) and not agent_tools.get_tool(act.get("action")).is_read_only)
            for act in actions
        )

        if has_modifications:
            created_approvals = await process_model_actions(assistant_content, session_id, workspace)
            all_approvals.extend(created_approvals)
            break

        # Check for read-only actions
        read_only_actions = [
            act for act in actions
            if agent_tools.get_tool(act.get("action")) and agent_tools.get_tool(act.get("action")).is_read_only
        ]
        if not read_only_actions:
            break

        # Stagnation prevention
        action_sig = tuple((act.get("action"), json.dumps(act, sort_keys=True)) for act in read_only_actions)
        if action_sig in previous_tool_signatures:
            logger.warning("Stagnation detected in non-streaming agent loop. Stopping tool execution.")
            break
        previous_tool_signatures.add(action_sig)

        # Execute read-only tools
        observations = []
        for act in read_only_actions:
            tool_name = act.get("action")
            tool_def = agent_tools.get_tool(tool_name)
            try:
                res = await tool_def.handler(workspace or ".", act, {"session_id": session_id})
                observations.append((tool_name, res))
            except Exception as e:
                observations.append((tool_name, {"status": "error", "error": str(e)}))

        ollama_messages.append({"role": "assistant", "content": assistant_content})
        obs_prompt = "\n\n".join([
            f"Observation from `{t_name}`:\n```json\n{json.dumps(t_res, indent=2)}\n```"
            for t_name, t_res in observations
        ]) + "\n\nUse this information to proceed or conclude."
        ollama_messages.append({"role": "user", "content": obs_prompt})

    # Mark plan completed
    await save_task_plan(plan_id, session_id, req.content.strip(), steps, "completed")

    final_content = "\n\n".join(total_assistant_parts) if total_assistant_parts else ""

    # Persist assistant response
    saved_assistant = await _save_message(
        session_id=session_id,
        role="assistant",
        content=final_content,
        tool_calls=all_approvals if all_approvals else None,
    )

    return {
        "message": saved_assistant,
        "approvals": all_approvals,
        "plan": {"id": plan_id, "steps": steps, "status": "completed"},
    }


@router.post("/stream")
async def stream_chat_message(req: ChatMessageRequest, request: Request):
    """Server-Sent Events (SSE) streaming chat endpoint with bounded agent loop, tool execution, and real-time events."""
    if not req.content or not req.content.strip():
        raise HTTPException(status_code=400, detail="Message content cannot be empty.")

    workspace = req.workspace_path or await get_setting("active_workspace", settings.ACTIVE_WORKSPACE)
    session_id = req.session_id

    if not session_id:
        sess = await create_chat_session(ChatSessionCreate(
            title=req.content[:30] + ("..." if len(req.content) > 30 else ""),
            workspace_path=workspace,
        ))
        session_id = sess.id

    # Save user message
    await _save_message(session_id, "user", req.content.strip())

    # Create initial task plan
    steps = generate_task_plan(req.content.strip(), req.mode or "chat")
    plan_id = str(uuid.uuid4())
    await save_task_plan(plan_id, session_id, req.content.strip(), steps, "in_progress")

    # Fetch prior history
    history = await get_session_messages(session_id)

    # Retrieve relevant uploaded document excerpts if available
    doc_context = ""
    try:
        from app.services.document_index import search_document_chunks
        doc_chunks = await search_document_chunks(query=req.content.strip(), session_id=session_id, limit=4)
        if doc_chunks:
            excerpts = []
            for ch in doc_chunks:
                excerpts.append(f"[{ch.citation()}]\n{ch.content}")
            doc_context = "\n\nATTACHED DOCUMENT EXCERPTS (Primary Grounding Evidence):\n" + "\n---\n".join(excerpts) + "\n"
    except Exception as e:
        logger.warning(f"Could not retrieve document context in stream: {e}")

    system_prompt = build_system_prompt(
        workspace_path=workspace,
        current_file_path=req.current_file_path,
        selected_code=req.selected_code,
        mode=req.mode or "chat",
        user_prompt=req.content.strip(),
    )
    if doc_context:
        system_prompt += f"\n\n{doc_context}\nCRITICAL DOCUMENT RULE: Use the attached document excerpts above as primary evidence. Never hallucinate facts or citations. Cite the page/file when stating facts."

    ollama_messages = [{"role": "system", "content": system_prompt}]
    for m in history:
        if m.role in ("user", "assistant"):
            ollama_messages.append({"role": m.role, "content": m.content})

    model = req.model or await get_setting("default_model", settings.DEFAULT_MODEL)
    temp = req.temperature if req.temperature is not None else float(await get_setting("temperature", str(settings.DEFAULT_TEMPERATURE)))
    ctx = req.num_ctx if req.num_ctx is not None else int(await get_setting("num_ctx", str(settings.DEFAULT_NUM_CTX)))
    predict = req.num_predict if req.num_predict is not None else int(await get_setting("num_predict", str(settings.DEFAULT_NUM_PREDICT)))

    async def event_generator() -> AsyncGenerator[str, None]:
        # Send initial event with session_id
        yield f"event: init\ndata: {json.dumps({'session_id': session_id})}\n\n"
        # Send plan event
        yield f"event: plan\ndata: {json.dumps({'id': plan_id, 'steps': steps, 'status': 'in_progress'})}\n\n"

        all_approvals = []
        previous_tool_signatures = set()
        accumulated_text_blocks = []

        try:
            for iteration in range(1, MAX_AGENT_ITERATIONS + 1):
                if await request.is_disconnected():
                    logger.info("Client disconnected. Cancelling streaming agent loop.")
                    break

                turn_chunks = []
                async for raw_line in ollama_client.chat_stream(
                    ollama_messages,
                    model=model,
                    temperature=temp,
                    num_ctx=ctx,
                    num_predict=predict,
                ):
                    if await request.is_disconnected():
                        logger.info("Client disconnected during stream. Cancelling.")
                        break

                    try:
                        data = json.loads(raw_line)
                        chunk = data.get("message", {}).get("content", "")
                        if chunk:
                            turn_chunks.append(chunk)
                            yield f"event: chunk\ndata: {json.dumps({'chunk': chunk})}\n\n"
                        if data.get("done", False):
                            break
                    except Exception:
                        continue

                turn_text = "".join(turn_chunks)
                if turn_text:
                    accumulated_text_blocks.append(turn_text)

                if await request.is_disconnected():
                    break

                actions = extract_actions(turn_text)
                if not actions:
                    break

                # Modification actions requiring approval
                has_modifications = any(
                    act.get("action") in (
                        "propose_file_write", "propose_file_edit", "propose_new_file",
                        "generate_patch", "propose_command", "propose_test_command"
                    ) or (agent_tools.get_tool(act.get("action")) and not agent_tools.get_tool(act.get("action")).is_read_only)
                    for act in actions
                )

                if has_modifications:
                    created_approvals = await process_model_actions(turn_text, session_id, workspace)
                    all_approvals.extend(created_approvals)
                    if created_approvals:
                        yield f"event: approvals\ndata: {json.dumps({'approvals': created_approvals})}\n\n"
                    break

                # Read-only actions
                read_only_actions = [
                    act for act in actions
                    if agent_tools.get_tool(act.get("action")) and agent_tools.get_tool(act.get("action")).is_read_only
                ]

                if not read_only_actions:
                    break

                # Stagnation check
                action_sig = tuple((act.get("action"), json.dumps(act, sort_keys=True)) for act in read_only_actions)
                if action_sig in previous_tool_signatures:
                    logger.warning("Stagnation detected in streaming agent loop. Stopping tool execution.")
                    break
                previous_tool_signatures.add(action_sig)

                # Execute read-only tools
                observations = []
                for act in read_only_actions:
                    tool_name = act.get("action")
                    tool_def = agent_tools.get_tool(tool_name)
                    yield f"event: tool_start\ndata: {json.dumps({'tool': tool_name, 'args': act, 'iteration': iteration})}\n\n"
                    try:
                        res = await tool_def.handler(workspace or ".", act, {"session_id": session_id})
                        yield f"event: tool_result\ndata: {json.dumps({'tool': tool_name, 'result': res, 'iteration': iteration})}\n\n"
                        observations.append((tool_name, res))
                    except Exception as tool_err:
                        err_res = {"status": "error", "error": str(tool_err)}
                        yield f"event: tool_result\ndata: {json.dumps({'tool': tool_name, 'result': err_res, 'iteration': iteration})}\n\n"
                        observations.append((tool_name, err_res))

                ollama_messages.append({"role": "assistant", "content": turn_text})
                obs_prompt = "\n\n".join([
                    f"Observation from `{t_name}`:\n```json\n{json.dumps(t_res, indent=2)}\n```"
                    for t_name, t_res in observations
                ]) + "\n\nAnalyze this observation. If you need more information, call another tool. If ready, provide your final response or propose a file change."
                ollama_messages.append({"role": "user", "content": obs_prompt})

            # Completed agent loop -> update task plan
            await save_task_plan(plan_id, session_id, req.content.strip(), steps, "completed")
            yield f"event: plan_update\ndata: {json.dumps({'id': plan_id, 'status': 'completed'})}\n\n"

            final_text = "\n\n".join(accumulated_text_blocks)
            if final_text:
                saved_msg = await _save_message(
                    session_id=session_id,
                    role="assistant",
                    content=final_text,
                    tool_calls=all_approvals if all_approvals else None,
                )
                yield f"event: done\ndata: {json.dumps({'message_id': saved_msg.id, 'session_id': session_id})}\n\n"
            else:
                yield f"event: done\ndata: {json.dumps({'session_id': session_id})}\n\n"

        except HTTPException as he:
            yield f"event: error\ndata: {json.dumps({'error': he.detail})}\n\n"
        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

