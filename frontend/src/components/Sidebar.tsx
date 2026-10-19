import React, { useState, useMemo } from 'react';
import {
  MessageSquarePlus,
  Search,
  FolderOpen,
  Folder,
  Settings as SettingsIcon,
  Trash2,
  Clock,
  ChevronRight,
  FolderPlus,
  Cpu,
  Layers,
  CheckCircle2,
  AlertCircle,
  FileCode,
  ShieldAlert,
} from 'lucide-react';
import { ApprovalItem, ChatSession, HealthResponse } from '../types';

interface SidebarProps {
  collapsed: boolean;
  sessions: ChatSession[];
  activeSessionId?: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;

  activeWorkspace: string | null;
  recentWorkspaces: string[];
  onOpenWorkspaceModal: () => void;
  onSelectWorkspace: (path: string) => void;

  health: HealthResponse | null;
  onOpenSettings: () => void;

  pendingApprovalsCount: number;
  onOpenApprovals: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  activeWorkspace,
  recentWorkspaces,
  onOpenWorkspaceModal,
  onSelectWorkspace,
  health,
  onOpenSettings,
  pendingApprovalsCount,
  onOpenApprovals,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [projectsExpanded, setProjectsExpanded] = useState(true);

  // Filter conversations by title or date
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [sessions, searchQuery]);

  // When collapsed, render compact icon rail
  if (collapsed) {
    return (
      <aside className="w-12 bg-white border-r border-slate-700/60 flex flex-col items-center py-3 justify-between select-none shrink-0 z-10">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#7066e0] via-[#c084fc] to-[#f472b6] flex items-center justify-center font-mono font-bold text-white text-[11px] shadow-[0_2px_8px_rgba(112,102,224,0.3)]">
            FL
          </div>

          <button
            onClick={onNewSession}
            className="p-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white transition shadow-[0_2px_8px_rgba(112,102,224,0.3)]"
            title="New Chat"
          >
            <MessageSquarePlus className="w-4 h-4" />
          </button>

          <button
            onClick={onOpenWorkspaceModal}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition"
            title="Open Project"
          >
            <FolderOpen className="w-4 h-4" />
          </button>

          {pendingApprovalsCount > 0 && (
            <button
              onClick={onOpenApprovals}
              className="relative p-2 rounded-full bg-amber-50 text-amber-600 hover:bg-amber-100 transition"
              title="Review Pending Approvals"
            >
              <ShieldAlert className="w-4 h-4" />
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">
                {pendingApprovalsCount}
              </span>
            </button>
          )}
        </div>

        <div className="flex flex-col items-center space-y-2">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              health?.ollama_connected ? 'bg-emerald-500 ring-2 ring-emerald-200' : 'bg-rose-500 ring-2 ring-rose-200'
            }`}
            title={health?.ollama_connected ? 'Ollama Online' : 'Ollama Offline'}
          />
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition"
            title="Settings"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-64 md:w-72 bg-white border-r border-slate-700/60 flex flex-col justify-between select-none shrink-0 z-10 transition-all duration-200">
      {/* Top area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* New Chat Button */}
        <div className="p-3 border-b border-slate-700/40">
          <button
            onClick={onNewSession}
            className="w-full flex items-center justify-center space-x-2 py-2.5 px-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition shadow-[0_2px_8px_rgba(112,102,224,0.3)] active:scale-[0.99]"
          >
            <MessageSquarePlus className="w-4 h-4" />
            <span>New Chat</span>
          </button>
        </div>

        {/* Search Conversations Input */}
        <div className="px-3 pt-3 pb-2">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-3 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full bg-[#f8f9fd] border border-slate-700/60 rounded-full pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 transition"
            />
          </div>
        </div>

        {/* Conversation History List */}
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
          <div className="px-2 py-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            <span>Conversations</span>
            <span className="font-mono text-slate-400">{filteredSessions.length}</span>
          </div>

          {filteredSessions.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-slate-400">
              {searchQuery ? 'No matching conversations' : 'No conversations yet'}
            </div>
          ) : (
            filteredSessions.map((sess) => {
              const isSelected = sess.id === activeSessionId;
              return (
                <div
                  key={sess.id}
                  onClick={() => onSelectSession(sess.id)}
                  className={`group flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer text-xs transition ${
                    isSelected
                      ? 'bg-blue-50/80 text-blue-700 font-medium border border-blue-200/80 shadow-xs'
                      : 'text-slate-700 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex flex-col truncate pr-2">
                    <span className="truncate text-[12px]">{sess.title}</span>
                    <span className="text-[10px] text-slate-400 flex items-center space-x-1 mt-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      <span>
                        {new Date(sess.updated_at).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Delete this conversation?')) {
                        onDeleteSession(sess.id);
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-500 rounded transition"
                    title="Delete conversation"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Projects & Recents Section */}
        <div className="border-t border-slate-700/40 p-2">
          <div
            onClick={() => setProjectsExpanded(!projectsExpanded)}
            className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 cursor-pointer hover:text-slate-600 transition"
          >
            <div className="flex items-center space-x-1">
              <ChevronRight
                className={`w-3 h-3 transition-transform ${
                  projectsExpanded ? 'rotate-90' : ''
                }`}
              />
              <span>Projects</span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenWorkspaceModal();
              }}
              className="p-1 hover:text-blue-600 rounded transition"
              title="Open Project"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
          </div>

          {projectsExpanded && (
            <div className="mt-1 space-y-1">
              {activeWorkspace && (
                <div
                  className="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg bg-blue-50/70 border border-blue-200/80 text-xs text-blue-700 truncate font-medium"
                  title={activeWorkspace}
                >
                  <Folder className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span className="truncate font-mono text-[11px]">
                    {activeWorkspace.split('/').pop()}
                  </span>
                </div>
              )}

              {recentWorkspaces
                .filter((p) => p !== activeWorkspace)
                .slice(0, 4)
                .map((path) => (
                  <div
                    key={path}
                    onClick={() => onSelectWorkspace(path)}
                    className="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 text-xs text-slate-600 hover:text-slate-900 cursor-pointer truncate transition"
                    title={path}
                  >
                    <Folder className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate font-mono text-[11px]">
                      {path.split('/').pop()}
                    </span>
                  </div>
                ))}

              <button
                onClick={onOpenWorkspaceModal}
                className="w-full text-left px-2.5 py-1 text-[11px] text-blue-600 hover:underline"
              >
                + Open another project...
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom status & settings bar */}
      <div className="p-3 border-t border-slate-700/40 bg-[#f8f9fd] flex items-center justify-between">
        <div className="flex items-center space-x-2 truncate">
          <div
            className={`w-2 h-2 rounded-full shrink-0 ${
              health?.ollama_connected ? 'bg-emerald-500 ring-2 ring-emerald-200' : 'bg-rose-500 ring-2 ring-rose-200'
            }`}
          />
          <div className="flex flex-col truncate">
            <span className="text-[11px] font-mono text-slate-800 truncate font-medium">
              {health?.active_model || 'qwen2.5-coder:7b'}
            </span>
            <span className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold">
              {health?.ollama_connected ? 'Offline Local Runtime' : 'Ollama Offline'}
            </span>
          </div>
        </div>

        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded-full hover:bg-slate-200/70 text-slate-500 hover:text-slate-800 transition"
          title="Settings"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
