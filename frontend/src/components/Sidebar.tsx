import React, { useState } from 'react';
import {
  Files,
  MessageSquare,
  ShieldAlert,
  Plus,
  RefreshCw,
  FolderPlus,
  Trash2,
  Clock,
} from 'lucide-react';
import { ApprovalItem, ChatSession, FileNode } from '../types';
import { FileTree } from './FileTree';

interface SidebarProps {
  tree: FileNode | null;
  loadingTree: boolean;
  activeFilePath?: string;
  onSelectFile: (path: string) => void;
  onRefreshTree: () => void;
  onCreateFile: (path: string) => void;
  onDeleteFile: (path: string) => void;

  sessions: ChatSession[];
  activeSessionId?: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;

  approvals: ApprovalItem[];
  onOpenApprovalModal: (approval: ApprovalItem) => void;
}

type TabType = 'explorer' | 'sessions' | 'approvals';

export const Sidebar: React.FC<SidebarProps> = ({
  tree,
  loadingTree,
  activeFilePath,
  onSelectFile,
  onRefreshTree,
  onCreateFile,
  onDeleteFile,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  approvals,
  onOpenApprovalModal,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('explorer');
  const [newFilePath, setNewFilePath] = useState('');
  const [showNewFileInput, setShowNewFileInput] = useState(false);

  const pendingApprovals = approvals.filter((a) => a.status === 'pending');

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newFilePath.trim()) {
      onCreateFile(newFilePath.trim());
      setNewFilePath('');
      setShowNewFileInput(false);
    }
  };

  return (
    <aside className="w-64 bg-editor-sidebar border-r border-editor-border flex flex-col shrink-0 select-none">
      {/* Activity Bar Tabs */}
      <div className="flex items-center border-b border-editor-border bg-editor-header/60">
        <button
          onClick={() => setActiveTab('explorer')}
          className={`flex-1 py-2 text-xs font-medium flex items-center justify-center space-x-1.5 border-b-2 transition ${
            activeTab === 'explorer'
              ? 'border-blue-500 text-blue-400 bg-zinc-800/30'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
          title="Project Explorer"
        >
          <Files className="w-3.5 h-3.5" />
          <span>Files</span>
        </button>

        <button
          onClick={() => setActiveTab('sessions')}
          className={`flex-1 py-2 text-xs font-medium flex items-center justify-center space-x-1.5 border-b-2 transition ${
            activeTab === 'sessions'
              ? 'border-blue-500 text-blue-400 bg-zinc-800/30'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
          title="Chat Sessions"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Chats</span>
        </button>

        <button
          onClick={() => setActiveTab('approvals')}
          className={`flex-1 py-2 text-xs font-medium flex items-center justify-center space-x-1.5 border-b-2 transition relative ${
            activeTab === 'approvals'
              ? 'border-amber-500 text-amber-400 bg-zinc-800/30'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
          title="Approvals Queue"
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Review</span>
          {pendingApprovals.length > 0 && (
            <span className="w-4 h-4 rounded-full bg-amber-500 text-black text-[9px] font-bold flex items-center justify-center ml-0.5">
              {pendingApprovals.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab Contents */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* Explorer View */}
        {activeTab === 'explorer' && (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-[11px] font-semibold tracking-wider uppercase text-zinc-400">
                Workspace Files
              </span>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setShowNewFileInput(!showNewFileInput)}
                  className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 transition"
                  title="New File"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onRefreshTree}
                  className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 transition"
                  title="Refresh Files"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingTree ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Inline New File input */}
            {showNewFileInput && (
              <form onSubmit={handleCreateSubmit} className="mb-2 px-1">
                <input
                  type="text"
                  value={newFilePath}
                  onChange={(e) => setNewFilePath(e.target.value)}
                  placeholder="e.g. src/app.py"
                  className="w-full bg-zinc-900 border border-blue-500 rounded px-2 py-1 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none"
                  autoFocus
                />
              </form>
            )}

            {/* Tree */}
            <div className="flex-1 overflow-y-auto">
              {tree ? (
                <FileTree
                  node={tree}
                  activeFilePath={activeFilePath}
                  onSelectFile={onSelectFile}
                  onDeleteFile={onDeleteFile}
                />
              ) : (
                <div className="text-zinc-500 text-xs p-2 text-center">
                  No workspace directory selected.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sessions View */}
        {activeTab === 'sessions' && (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-[11px] font-semibold tracking-wider uppercase text-zinc-400">
                Chat Sessions
              </span>
              <button
                onClick={onNewSession}
                className="flex items-center space-x-1 px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] transition"
              >
                <Plus className="w-3 h-3" />
                <span>New</span>
              </button>
            </div>

            <div className="space-y-1 overflow-y-auto flex-1">
              {sessions.map((sess) => {
                const isSelected = sess.id === activeSessionId;
                return (
                  <div
                    key={sess.id}
                    onClick={() => onSelectSession(sess.id)}
                    className={`group flex items-center justify-between p-2 rounded cursor-pointer text-xs transition ${
                      isSelected
                        ? 'bg-blue-600/20 text-blue-300 border-l-2 border-blue-500'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                    }`}
                  >
                    <div className="flex flex-col truncate pr-2">
                      <span className="font-medium truncate">{sess.title}</span>
                      <span className="text-[10px] text-zinc-500 flex items-center space-x-1">
                        <Clock className="w-2.5 h-2.5" />
                        <span>{new Date(sess.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Delete this chat session?')) {
                          onDeleteSession(sess.id);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-400 rounded transition"
                      title="Delete session"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Approvals Tab */}
        {activeTab === 'approvals' && (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-[11px] font-semibold tracking-wider uppercase text-zinc-400">
                Audit & Approvals
              </span>
            </div>

            <div className="space-y-2 overflow-y-auto flex-1">
              {approvals.length === 0 ? (
                <div className="text-zinc-500 text-xs p-3 text-center">
                  No proposed actions recorded yet.
                </div>
              ) : (
                approvals.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => onOpenApprovalModal(item)}
                    className={`p-2.5 rounded border text-xs cursor-pointer transition ${
                      item.status === 'pending'
                        ? 'bg-amber-950/20 border-amber-700/60 hover:bg-amber-950/40'
                        : item.status === 'executed'
                        ? 'bg-emerald-950/20 border-emerald-800/40 opacity-75'
                        : 'bg-zinc-900 border-zinc-800 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-zinc-200 uppercase text-[10px]">
                        {item.action_type.replace('_', ' ')}
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                          item.status === 'pending'
                            ? 'bg-amber-500/20 text-amber-300'
                            : item.status === 'executed'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>

                    <div className="text-zinc-300 font-mono text-[11px] truncate mb-1">
                      {item.target_path || (item.command_args ? item.command_args.join(' ') : 'System command')}
                    </div>

                    <div className="text-[11px] text-zinc-400 line-clamp-2 italic">
                      {item.reason}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
