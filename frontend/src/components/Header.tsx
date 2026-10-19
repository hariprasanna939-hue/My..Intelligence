import React from 'react';
import {
  FolderOpen,
  Settings as SettingsIcon,
  ShieldAlert,
  Cpu,
  CheckCircle2,
  AlertCircle,
  Terminal,
} from 'lucide-react';
import { HealthResponse } from '../types';

interface HeaderProps {
  health: HealthResponse | null;
  activeWorkspace: string | null;
  pendingApprovalsCount: number;
  onOpenWorkspaceModal: () => void;
  onOpenApprovals: () => void;
  onOpenSettings: () => void;
  onToggleTerminal: () => void;
  terminalOpen: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  health,
  activeWorkspace,
  pendingApprovalsCount,
  onOpenWorkspaceModal,
  onOpenApprovals,
  onOpenSettings,
  onToggleTerminal,
  terminalOpen,
}) => {
  return (
    <header className="h-12 bg-editor-header border-b border-editor-border flex items-center justify-between px-4 select-none shrink-0">
      {/* Brand & Workspace */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center font-bold text-white text-xs shadow">
            FL
          </div>
          <span className="font-semibold text-sm tracking-wide text-zinc-100">
            ForgeLocal
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono uppercase tracking-wider border border-zinc-700">
            Offline
          </span>
        </div>

        <div className="h-4 w-[1px] bg-editor-border" />

        {/* Workspace selector */}
        <button
          onClick={onOpenWorkspaceModal}
          className="flex items-center space-x-2 px-2.5 py-1 rounded bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/60 text-xs text-zinc-200 transition"
          title="Click to switch active project workspace"
        >
          <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
          <span className="max-w-[280px] truncate font-mono text-[11px]">
            {activeWorkspace || 'Select Workspace...'}
          </span>
        </button>
      </div>

      {/* Middle & Right status actions */}
      <div className="flex items-center space-x-3">
        {/* Ollama Model status */}
        <div
          className={`flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-xs border ${
            health?.ollama_connected
              ? 'bg-emerald-950/40 border-emerald-700/50 text-emerald-400'
              : 'bg-rose-950/40 border-rose-700/50 text-rose-400'
          }`}
          title={
            health?.ollama_connected
              ? `Connected to Ollama on ${health.ollama_url}`
              : `Ollama disconnected. Run 'ollama serve' locally.`
          }
        >
          <Cpu className="w-3 h-3" />
          <span className="font-mono text-[11px]">
            {health?.ollama_connected ? health.active_model : 'Ollama Offline'}
          </span>
          {health?.ollama_connected ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          ) : (
            <AlertCircle className="w-3 h-3 text-rose-400" />
          )}
        </div>

        {/* Terminal Toggle Button */}
        <button
          onClick={onToggleTerminal}
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs transition border ${
            terminalOpen
              ? 'bg-zinc-700 text-white border-zinc-600'
              : 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border-zinc-700/60'
          }`}
          title="Toggle Terminal & Test Runner"
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Terminal</span>
        </button>

        {/* Approvals Badge / Trigger */}
        <button
          onClick={onOpenApprovals}
          className={`relative flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs transition border ${
            pendingApprovalsCount > 0
              ? 'bg-amber-950/60 border-amber-600 text-amber-300 hover:bg-amber-900/60 animate-pulse'
              : 'bg-zinc-800/80 hover:bg-zinc-700 border-zinc-700/60 text-zinc-300'
          }`}
          title="Review Pending Changes & Human Approvals"
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>Approvals</span>
          {pendingApprovalsCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-amber-500 text-black text-[10px] font-bold flex items-center justify-center ml-1">
              {pendingApprovalsCount}
            </span>
          )}
        </button>

        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
          title="ForgeLocal Settings"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
