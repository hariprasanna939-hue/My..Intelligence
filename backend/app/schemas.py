"""Pydantic schemas for ForgeLocal API requests and responses."""

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


# -------------------------------------------------------------
# Health & Environment
# -------------------------------------------------------------
class ModelInfo(BaseModel):
    name: str
    size: Optional[int] = None
    modified_at: Optional[str] = None
    parameter_size: Optional[str] = None
    quantization_level: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    version: str = "1.0.0"
    ollama_connected: bool
    ollama_url: str
    active_model: str
    available_models: List[ModelInfo] = Field(default_factory=list)
    active_workspace: Optional[str] = None


# -------------------------------------------------------------
# Workspace & Files
# -------------------------------------------------------------
class SetWorkspaceRequest(BaseModel):
    workspace_path: str = Field(..., description="Absolute path to project directory")


class FileNode(BaseModel):
    name: str
    path: str
    is_dir: bool
    size: Optional[int] = None
    children: Optional[List["FileNode"]] = None


class FileReadResponse(BaseModel):
    path: str
    relative_path: str
    content: str
    size: int
    is_binary: bool = False


class FileSearchRequest(BaseModel):
    query: str
    max_results: int = 50


class FileSearchMatch(BaseModel):
    file_path: str
    line_number: int
    line_content: str


# -------------------------------------------------------------
# Approvals (Human-in-the-Loop)
# -------------------------------------------------------------
ActionType = Literal["write_file", "patch_file", "delete_file", "run_command"]
ApprovalStatus = Literal["pending", "approved", "rejected", "executed", "failed"]


class ApprovalCreate(BaseModel):
    session_id: Optional[str] = None
    action_type: ActionType
    target_path: Optional[str] = None
    content: Optional[str] = None
    original_content: Optional[str] = None
    diff: Optional[str] = None
    command_args: Optional[List[str]] = None
    reason: str


class ApprovalItem(BaseModel):
    id: str
    session_id: Optional[str] = None
    action_type: ActionType
    target_path: Optional[str] = None
    content: Optional[str] = None
    original_content: Optional[str] = None
    diff: Optional[str] = None
    command_args: Optional[List[str]] = None
    reason: str
    status: ApprovalStatus
    execution_result: Optional[str] = None
    created_at: str
    resolved_at: Optional[str] = None


class ApprovalDecisionRequest(BaseModel):
    decision: Literal["approve", "reject"]


# -------------------------------------------------------------
# Commands & Testing
# -------------------------------------------------------------
class CommandExecutionRequest(BaseModel):
    command_args: List[str]
    session_id: Optional[str] = None
    reason: Optional[str] = "Manual user execution"


class CommandExecutionResponse(BaseModel):
    command: str
    return_code: int
    stdout: str
    stderr: str
    execution_time_ms: float
    timed_out: bool = False


# -------------------------------------------------------------
# Chat & Agent
# -------------------------------------------------------------
class ChatSessionCreate(BaseModel):
    title: Optional[str] = "New Session"
    workspace_path: Optional[str] = None


class ChatSession(BaseModel):
    id: str
    title: str
    workspace_path: Optional[str] = None
    created_at: str
    updated_at: str
    message_count: int = 0


class ChatMessage(BaseModel):
    id: str
    session_id: str
    role: Literal["user", "assistant", "system", "tool"]
    content: str
    tool_calls: Optional[Any] = None
    tool_results: Optional[Any] = None
    created_at: str


class ChatMessageRequest(BaseModel):
    content: str = Field(..., min_length=1, description="User prompt content")
    session_id: Optional[str] = None
    model: Optional[str] = None
    temperature: Optional[float] = Field(None, ge=0.0, le=2.0)
    num_ctx: Optional[int] = Field(None, ge=1024, le=32768)
    num_predict: Optional[int] = Field(None, ge=128, le=16384)
    mode: Optional[Literal["chat", "explain", "refactor", "test", "fix"]] = "chat"
    current_file_path: Optional[str] = None
    selected_code: Optional[str] = None


# -------------------------------------------------------------
# Settings
# -------------------------------------------------------------
class AppSettings(BaseModel):
    ollama_base_url: str
    default_model: str
    temperature: float = 0.2
    num_ctx: int = 8192
    num_predict: int = 2048
    request_timeout_seconds: float = 120.0
    allowed_commands: List[str]
    command_timeout_seconds: int
    max_file_size_bytes: int
    active_workspace: Optional[str] = None


class AppSettingsUpdate(BaseModel):
    ollama_base_url: Optional[str] = None
    default_model: Optional[str] = None
    temperature: Optional[float] = None
    num_ctx: Optional[int] = None
    num_predict: Optional[int] = None
    request_timeout_seconds: Optional[float] = None
    allowed_commands: Optional[List[str]] = None
    command_timeout_seconds: Optional[int] = None
    max_file_size_bytes: Optional[int] = None
    active_workspace: Optional[str] = None
