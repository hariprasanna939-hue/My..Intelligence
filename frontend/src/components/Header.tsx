import React from 'react';
import {
  FolderOpen,
  Settings as SettingsIcon,
  ShieldAlert,
  Cpu,
  CheckCircle2,
  AlertCircle,
  Terminal,
  PanelLeftClose,
  PanelLeft,
  Columns,
  MessageSquare,
  Code2,
  Menu,
} from 'lucide-react';
import { HealthResponse } from '../types';

export type ViewLayoutMode = 'split' | 'chat-only' | 'code-only';

interface HeaderProps {
  health: HealthResponse | null;
  activeWorkspace: string | null;
  activeConversationTitle?: string;
  pendingApprovalsCount: number;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenWorkspaceModal: () => void;
  onOpenApprovals: () => void;
  onOpenSettings: () => void;
  onToggleTerminal: () => void;
  terminalOpen: boolean;
  layoutMode: ViewLayoutMode;
  onChangeLayoutMode: (mode: ViewLayoutMode) => void;
  onToggleMobileDrawer: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  health,
  activeWorkspace,
  activeConversationTitle,
  pendingApprovalsCount,
  sidebarCollapsed,
  onToggleSidebar,
  onOpenWorkspaceModal,
  onOpenApprovals,
  onOpenSettings,
  onToggleTerminal,
  terminalOpen,
  layoutMode,
  onChangeLayoutMode,
  onToggleMobileDrawer,
}) => {
  const projectName = activeWorkspace ? activeWorkspace.split('/').pop() || activeWorkspace : null;

  return (
    <header className="h-12 bg-navy-950 border-b border-navy-700/80 flex items-center justify-between px-3 md:px-4 select-none shrink-0 z-20">
      {/* Left: Mobile hamburger, Sidebar toggle, Logo & Project info */}
      <div className="flex items-center space-x-2 md:space-x-3">
        {/* Mobile menu trigger */}
        <button
          onClick={onToggleMobileDrawer}
          className="md:hidden p-1.5 rounded-md hover:bg-navy-800 text-slate-400 hover:text-slate-100 transition"
          title="Open menu"
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* Desktop Sidebar collapse toggle */}
        <button
          onClick={onToggleSidebar}
          className="hidden md:flex p-1.5 rounded-md hover:bg-navy-800 text-slate-400 hover:text-slate-200 transition"
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>

        {/* Logo & App Name */}
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center font-mono font-bold text-white text-[11px] shadow-sm shadow-blue-500/20">
            FL
          </div>
          <span className="font-semibold text-xs md:text-sm tracking-tight text-slate-100 hidden sm:inline">
            ForgeLocal
          </span>
        </div>

        <div className="hidden sm:block h-4 w-[1px] bg-navy-700" />

        {/* Current Project Badge */}
        <button
          onClick={onOpenWorkspaceModal}
          className="flex items-center space-x-1.5 px-2 py-1 rounded bg-navy-900 hover:bg-navy-800 border border-navy-700/80 text-xs text-slate-300 transition max-w-[160px] md:max-w-[220px]"
          title={activeWorkspace ? `Project: ${activeWorkspace}` : 'Click to select project'}
        >
          <FolderOpen className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span className="truncate font-mono text-[11px]">
            {projectName || 'Select Project'}
          </span>
        </button>

        {/* Current Conversation title if available */}
        {activeConversationTitle && (
          <div className="hidden lg:flex items-center space-x-1 text-slate-500 text-xs font-mono">
            <span>/</span>
            <span className="text-slate-400 truncate max-w-[180px]">
              {activeConversationTitle}
            </span>
          </div>
        )}
      </div>

      {/* Center: View Layout Switcher (Desktop) */}
      <div className="hidden md:flex items-center bg-navy-900 border border-navy-700/80 rounded-lg p-0.5 space-x-0.5">
        <button
          onClick={() => onChangeLayoutMode('chat-only')}
          className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
            layoutMode === 'chat-only'
              ? 'bg-navy-800 text-blue-400 shadow-sm border border-navy-700/50'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Chat Focus"
        >
          <MessageSquare className="w-3 h-3" />
          <span>Chat</span>
        </button>

        <button
          onClick={() => onChangeLayoutMode('split')}
          className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
            layoutMode === 'split'
              ? 'bg-navy-800 text-blue-400 shadow-sm border border-navy-700/50'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Split View (Chat & Workspace)"
        >
          <Columns className="w-3 h-3" />
          <span>Split</span>
        </button>

        <button
          onClick={() => onChangeLayoutMode('code-only')}
          className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
            layoutMode === 'code-only'
              ? 'bg-navy-800 text-blue-400 shadow-sm border border-navy-700/50'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Code Workspace Focus"
        >
          <Code2 className="w-3 h-3" />
          <span>Code</span>
        </button>
      </div>

      {/* Right: Local Model Status, Approvals, Terminal, Settings */}
      <div className="flex items-center space-x-2 md:space-x-2.5">
        {/* Local model status indicator */}
        <div
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] border transition ${
            health?.ollama_connected
              ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-400'
              : 'bg-rose-950/40 border-rose-700/60 text-rose-400'
          }`}
          title={
            health?.ollama_connected
              ? `Connected locally to Ollama (${health.active_model}) on Apple Silicon. Zero cloud telemetry.`
              : 'Ollama is offline. Start it locally using: ollama serve'
          }
        >
          <Cpu className="w-3 h-3 shrink-0" />
          <span className="font-mono text-[10px] md:text-[11px] hidden sm:inline">
            {health?.ollama_connected ? health.active_model : 'Offline'}
          </span>
          {health?.ollama_connected ? (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          )}
        </div>

        {/* Approvals Review Pill */}
        <button
          onClick={onOpenApprovals}
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs transition border ${
            pendingApprovalsCount > 0
              ? 'bg-amber-950/60 border-amber-500/80 text-amber-300 hover:bg-amber-900/60 shadow-sm animate-pulse'
              : 'bg-navy-900 hover:bg-navy-800 border-navy-700/80 text-slate-400 hover:text-slate-200'
          }`}
          title="Review Pending Changes & Human Approvals"
        >
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">Approvals</span>
          {pendingApprovalsCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-amber-500 text-black text-[9px] font-bold flex items-center justify-center">
              {pendingApprovalsCount}
            </span>
          )}
        </button>

        {/* Terminal Toggle Button */}
        <button
          onClick={onToggleTerminal}
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs transition border ${
            terminalOpen
              ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
              : 'bg-navy-900 hover:bg-navy-800 border-navy-700/80 text-slate-400 hover:text-slate-200'
          }`}
          title="Toggle Terminal & Test Runner"
        >
          <Terminal className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden lg:inline">Terminal</span>
        </button>

        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded-md bg-navy-900 hover:bg-navy-800 border border-navy-700/80 text-slate-400 hover:text-slate-100 transition"
          title="ForgeLocal Settings"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
