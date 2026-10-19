import {
  AppSettings,
  ApprovalItem,
  ChatMessage,
  ChatSession,
  CommandResult,
  FileNode,
  FileReadResponse,
  HealthResponse,
} from '../types';

const API_BASE = '/api';

export const api = {
  // Health
  async getHealth(): Promise<HealthResponse> {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error(`Health check failed: ${res.statusText}`);
    return res.json();
  },

  // Workspace
  async getWorkspace(): Promise<{ active_workspace: string | null }> {
    const res = await fetch(`${API_BASE}/workspace`);
    if (!res.ok) throw new Error(`Failed to get active workspace: ${res.statusText}`);
    return res.json();
  },

  async setWorkspace(workspace_path: string): Promise<{ status: string; active_workspace: string }> {
    const res = await fetch(`${API_BASE}/workspace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_path }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to set workspace');
    }
    return res.json();
  },

  async getWorkspaceTree(): Promise<FileNode> {
    const res = await fetch(`${API_BASE}/workspace/tree`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to load workspace tree');
    }
    return res.json();
  },

  async readFile(path: string): Promise<FileReadResponse> {
    const res = await fetch(`${API_BASE}/workspace/file?path=${encodeURIComponent(path)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to read file');
    }
    return res.json();
  },

  async saveFile(path: string, content: string): Promise<{ status: string }> {
    const res = await fetch(`${API_BASE}/workspace/file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to save file');
    }
    return res.json();
  },

  async deleteFile(path: string): Promise<{ status: string }> {
    const res = await fetch(`${API_BASE}/workspace/file?path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to delete file');
    }
    return res.json();
  },

  // Approvals
  async listApprovals(status?: string): Promise<ApprovalItem[]> {
    const url = status ? `${API_BASE}/approvals?status=${encodeURIComponent(status)}` : `${API_BASE}/approvals`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to list approvals');
    return res.json();
  },

  async getApproval(id: string): Promise<ApprovalItem> {
    const res = await fetch(`${API_BASE}/approvals/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error('Failed to get approval details');
    return res.json();
  },

  async decideApproval(id: string, decision: 'approve' | 'reject'): Promise<ApprovalItem> {
    const res = await fetch(`${API_BASE}/approvals/${encodeURIComponent(id)}/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to resolve approval');
    }
    return res.json();
  },

  // Commands
  async runCommand(command_args: string[]): Promise<CommandResult> {
    const res = await fetch(`${API_BASE}/commands/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command_args }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Command execution failed');
    }
    return res.json();
  },

  async getAllowedCommands(): Promise<string[]> {
    const res = await fetch(`${API_BASE}/commands/allowed`);
    if (!res.ok) throw new Error('Failed to fetch allowed commands');
    return res.json();
  },

  // Settings
  async getSettings(): Promise<AppSettings> {
    const res = await fetch(`${API_BASE}/settings`);
    if (!res.ok) throw new Error('Failed to fetch settings');
    return res.json();
  },

  async updateSettings(update: Partial<AppSettings>): Promise<AppSettings> {
    const res = await fetch(`${API_BASE}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
    if (!res.ok) throw new Error('Failed to update settings');
    return res.json();
  },

  // Chat Sessions
  async listSessions(): Promise<ChatSession[]> {
    const res = await fetch(`${API_BASE}/chat/sessions`);
    if (!res.ok) throw new Error('Failed to list chat sessions');
    return res.json();
  },

  async createSession(title?: string): Promise<ChatSession> {
    const res = await fetch(`${API_BASE}/chat/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title || 'New Session' }),
    });
    if (!res.ok) throw new Error('Failed to create session');
    return res.json();
  },

  async getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
    const res = await fetch(`${API_BASE}/chat/sessions/${encodeURIComponent(sessionId)}/messages`);
    if (!res.ok) throw new Error('Failed to load session messages');
    return res.json();
  },

  async deleteSession(sessionId: string): Promise<{ status: string }> {
    const res = await fetch(`${API_BASE}/chat/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete session');
    return res.json();
  },

  // SSE Chat Streaming
  async streamChatMessage(
    payload: {
      content: string;
      session_id?: string;
      mode?: string;
      current_file_path?: string;
      selected_code?: string;
    },
    callbacks: {
      onInit?: (sessionId: string) => void;
      onChunk?: (chunk: string) => void;
      onApprovals?: (approvals: ApprovalItem[]) => void;
      onDone?: (messageId: string, sessionId: string) => void;
      onError?: (error: string) => void;
    }
  ): Promise<void> {
    const response = await fetch(`${API_BASE}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(err.detail || 'Streaming failed');
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body has no reader');

    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const eventStr of events) {
        if (!eventStr.trim()) continue;
        const lines = eventStr.split('\n');
        let eventType = 'message';
        let eventData = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            eventData = line.slice(6).trim();
          }
        }

        try {
          const parsed = JSON.parse(eventData);
          if (eventType === 'init' && callbacks.onInit) {
            callbacks.onInit(parsed.session_id);
          } else if (eventType === 'chunk' && callbacks.onChunk) {
            callbacks.onChunk(parsed.chunk);
          } else if (eventType === 'approvals' && callbacks.onApprovals) {
            callbacks.onApprovals(parsed.approvals);
          } else if (eventType === 'done' && callbacks.onDone) {
            callbacks.onDone(parsed.message_id, parsed.session_id);
          } else if (eventType === 'error' && callbacks.onError) {
            callbacks.onError(parsed.error);
          }
        } catch (e) {
          console.error('Failed to parse SSE line:', eventData, e);
        }
      }
    }
  },
};
