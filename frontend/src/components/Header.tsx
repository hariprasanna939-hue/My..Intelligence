import React from 'react';
import {
  FolderOpen,
  Settings as SettingsIcon,
  ShieldAlert,
  Cpu,
  Terminal,
  PanelLeftClose,
  PanelLeft,
  Columns,
  MessageSquare,
  Code2,
  Menu,
} from 'lucide-react';
import { AppWorkingMode, HealthResponse } from '../types';
import { ModeSwitcher } from './ModeSwitcher';

export type ViewLayoutMode = 'split' | 'chat-only' | 'code-only';

interface HeaderProps {
  appMode: AppWorkingMode;
  onChangeAppMode: (mode: AppWorkingMode) => void;
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
  appMode,
  onChangeAppMode,
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
    <header className="h-14 bg-white/90 backdrop-blur-xl border-b border-[#9ea2ec]/35 flex items-center justify-between px-3 md:px-5 select-none shrink-0 z-20 shadow-[0_2px_12px_rgba(112,102,224,0.06)]">
      {/* Left: Mobile hamburger, Sidebar toggle, Logo & Project info */}
      <div className="flex items-center space-x-2 md:space-x-3 overflow-hidden">
        {/* Mobile menu circular trigger (Inspired by Reference Image top-left button) */}
        <button
          onClick={onToggleMobileDrawer}
          className="md:hidden w-9 h-9 rounded-full bg-white hover:bg-[#f1f4fe] border border-[#9ea2ec]/40 shadow-sm flex items-center justify-center text-[#5c6096] hover:text-[#1e1b4b] transition shrink-0"
          title="Open menu"
        >
          <Menu className="w-4 h-4 text-[#7066e0]" />
        </button>

        {/* Desktop Sidebar collapse toggle (only in agent mode) */}
        {appMode === 'agent' && (
          <button
            onClick={onToggleSidebar}
            className="hidden md:flex w-9 h-9 rounded-full bg-white hover:bg-[#f1f4fe] border border-[#9ea2ec]/40 shadow-sm items-center justify-center text-[#5c6096] hover:text-[#1e1b4b] transition shrink-0"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <PanelLeft className="w-4 h-4 text-[#7066e0]" /> : <PanelLeftClose className="w-4 h-4 text-[#7066e0]" />}
          </button>
        )}

        {/* Logo & App Name */}
        <div className="flex items-center space-x-2.5 shrink-0">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#7066e0] to-[#9d8ff7] flex items-center justify-center font-mono font-bold text-white text-xs shadow-[0_4px_12px_rgba(112,102,224,0.35)] ring-2 ring-white">
            MI
          </div>
          <span className="font-semibold text-sm tracking-tight text-[#1e1b4b] hidden sm:inline">
            My Intelligence
          </span>
        </div>

        {/* In Agent Mode, show current project & conversation breadcrumb */}
        {appMode === 'agent' && (
          <>
            <div className="hidden sm:block h-4 w-[1px] bg-slate-700/60 shrink-0" />

            {/* Current Project Pill */}
            <button
              onClick={onOpenWorkspaceModal}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-white hover:bg-slate-900 border border-slate-700/60 text-xs text-slate-100 transition max-w-[140px] md:max-w-[200px] shrink-0 shadow-sm"
              title={activeWorkspace ? `Project: ${activeWorkspace}` : 'Click to select project'}
            >
              <FolderOpen className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="truncate font-mono text-[11px] font-medium">
                {projectName || 'Select Project'}
              </span>
            </button>

            {/* Current Conversation title if available */}
            {activeConversationTitle && (
              <div className="hidden xl:flex items-center space-x-1 text-slate-400 text-xs font-mono truncate">
                <span>/</span>
                <span className="text-slate-300 truncate max-w-[160px]">
                  {activeConversationTitle}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Center: View Layout Switcher (Desktop Agent Mode Only) */}
      {appMode === 'agent' ? (
        <div className="hidden lg:flex items-center bg-white/90 border border-slate-700/60 rounded-full p-1 space-x-1 shadow-sm">
          <button
            onClick={() => onChangeLayoutMode('chat-only')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition ${
              layoutMode === 'chat-only'
                ? 'bg-blue-50 text-blue-600 shadow-sm font-semibold border border-blue-200'
                : 'text-slate-400 hover:text-slate-100'
            }`}
            title="Chat Focus"
          >
            <MessageSquare className="w-3 h-3" />
            <span>Chat</span>
          </button>

          <button
            onClick={() => onChangeLayoutMode('split')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition ${
              layoutMode === 'split'
                ? 'bg-blue-50 text-blue-600 shadow-sm font-semibold border border-blue-200'
                : 'text-slate-400 hover:text-slate-100'
            }`}
            title="Split View (Chat & Workspace)"
          >
            <Columns className="w-3 h-3" />
            <span>Split</span>
          </button>

          <button
            onClick={() => onChangeLayoutMode('code-only')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition ${
              layoutMode === 'code-only'
                ? 'bg-blue-50 text-blue-600 shadow-sm font-semibold border border-blue-200'
                : 'text-slate-400 hover:text-slate-100'
            }`}
            title="Code Workspace Focus"
          >
            <Code2 className="w-3 h-3" />
            <span>Code</span>
          </button>
        </div>
      ) : null}

      {/* Right: Local Model Status, Mode Switcher, Approvals, Terminal, Settings */}
      <div className="flex items-center space-x-2 md:space-x-2.5 shrink-0">
        {/* Local model status indicator */}
        <div
          className={`hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-[11px] border shadow-sm transition ${
            health?.ollama_connected
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}
          title={
            health?.ollama_connected
              ? `Connected locally to Ollama (${health.active_model}) on Apple Silicon. Zero cloud telemetry.`
              : 'Ollama is offline. Start it locally using: ollama serve'
          }
        >
          <Cpu className="w-3.5 h-3.5 shrink-0 text-blue-600" />
          <span className="font-mono text-[10px] md:text-[11px] font-medium hidden md:inline">
            {health?.ollama_connected ? health.active_model : 'Offline'}
          </span>
          {health?.ollama_connected ? (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          )}
        </div>

        {/* In Agent Mode, show Approvals & Terminal controls */}
        {appMode === 'agent' && (
          <>
            {/* Approvals Review Pill */}
            <button
              onClick={onOpenApprovals}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs transition border shadow-sm ${
                pendingApprovalsCount > 0
                  ? 'bg-amber-100 border-amber-300 text-amber-900 hover:bg-amber-200 animate-pulse font-semibold'
                  : 'bg-white hover:bg-slate-900 border-slate-700/60 text-slate-400 hover:text-slate-100'
              }`}
              title="Review Pending Changes & Human Approvals"
            >
              <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-amber-600" />
              <span className="hidden xl:inline">Approvals</span>
              {pendingApprovalsCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {pendingApprovalsCount}
                </span>
              )}
            </button>

            {/* Terminal Toggle Button */}
            <button
              onClick={onToggleTerminal}
              className={`hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs transition border shadow-sm ${
                terminalOpen
                  ? 'bg-blue-600 text-white border-blue-500'
                  : 'bg-white hover:bg-slate-900 border-slate-700/60 text-slate-400 hover:text-slate-100'
              }`}
              title="Toggle Terminal & Test Runner"
            >
              <Terminal className="w-3.5 h-3.5 shrink-0 text-blue-600" />
              <span className="hidden xl:inline">Terminal</span>
            </button>
          </>
        )}

        {/* TOP-RIGHT MODE SWITCHER: Chat Mode | Agent Mode */}
        <ModeSwitcher
          mode={appMode}
          onChangeMode={onChangeAppMode}
          compact={false}
        />

        {/* Circular Settings button (Directly inspired by Reference Image top-right gear button) */}
        <button
          onClick={onOpenSettings}
          className="w-9 h-9 rounded-full bg-white hover:bg-[#f1f4fe] border border-[#9ea2ec]/40 shadow-sm flex items-center justify-center text-[#5c6096] hover:text-[#7066e0] transition shrink-0"
          title="My Intelligence Settings"
        >
          <SettingsIcon className="w-4 h-4 text-[#7066e0]" />
        </button>
      </div>
    </header>
  );
};
