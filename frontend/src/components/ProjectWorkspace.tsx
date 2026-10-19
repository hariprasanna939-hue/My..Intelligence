import React, { useState } from 'react';
import {
  FileCode,
  Save,
  Check,
  X,
  Search,
  Plus,
  RefreshCw,
  Columns,
  GitCompare,
  Terminal as TerminalIcon,
  FolderOpen,
} from 'lucide-react';
import { ApprovalItem, CommandResult, FileNode, OpenFileTab } from '../types';
import { FileTree } from './FileTree';
import { EditorArea } from './EditorArea';
import { DiffViewer } from './DiffViewer';
import { TerminalPanel } from './TerminalPanel';

interface ProjectWorkspaceProps {
  activeWorkspace: string | null;
  tree: FileNode | null;
  loadingTree: boolean;
  onRefreshTree: () => void;
  onCreateFile: (path: string) => void;
  onDeleteFile: (path: string) => void;

  tabs: OpenFileTab[];
  activeTabPath?: string;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onChangeContent: (path: string, newContent: string) => void;
  onSaveFile: (path: string) => void;
  onSelectionChange?: (selectedText: string) => void;

  approvals: ApprovalItem[];
  onOpenApprovalModal: (approval: ApprovalItem) => void;

  terminalOpen: boolean;
  onToggleTerminal: () => void;
  onRunCommand: (commandArgs: string[]) => Promise<void>;
  commandResult: CommandResult | null;
  isRunningCommand: boolean;
  onOpenWorkspaceModal: () => void;
}

export const ProjectWorkspace: React.FC<ProjectWorkspaceProps> = ({
  activeWorkspace,
  tree,
  loadingTree,
  onRefreshTree,
  onCreateFile,
  onDeleteFile,
  tabs,
  activeTabPath,
  onSelectTab,
  onCloseTab,
  onChangeContent,
  onSaveFile,
  onSelectionChange,
  approvals,
  onOpenApprovalModal,
  terminalOpen,
  onToggleTerminal,
  onRunCommand,
  commandResult,
  isRunningCommand,
  onOpenWorkspaceModal,
}) => {
  const [explorerCollapsed, setExplorerCollapsed] = useState(false);
  const [fileSearch, setFileSearch] = useState('');
  const [newFilePath, setNewFilePath] = useState('');
  const [showNewFileInput, setShowNewFileInput] = useState(false);
  const [viewingDiffId, setViewingDiffId] = useState<string | null>(null);

  const activeTab = tabs.find((t) => t.path === activeTabPath);
  const pendingApprovalsWithDiff = approvals.filter(
    (a) => a.status === 'pending' && a.diff
  );

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newFilePath.trim()) {
      onCreateFile(newFilePath.trim());
      setNewFilePath('');
      setShowNewFileInput(false);
    }
  };

  if (!activeWorkspace) {
    return (
      <div className="flex-1 bg-[#f3f5fd] flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="w-14 h-14 rounded-2xl bg-white border border-slate-700/60 shadow-[0_4px_16px_rgba(41,44,121,0.06)] flex items-center justify-center mb-3">
          <FolderOpen className="w-7 h-7 text-blue-600" />
        </div>
        <h3 className="text-sm font-semibold text-slate-800 mb-1">No Project Workspace Open</h3>
        <p className="text-xs text-slate-500 max-w-sm mb-4">
          Open a local project directory to explore files, edit code, and inspect proposed changes.
        </p>
        <button
          onClick={onOpenWorkspaceModal}
          className="px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition shadow-[0_2px_8px_rgba(112,102,224,0.3)]"
        >
          Select Project Workspace
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-[#f3f5fd] flex flex-col h-full overflow-hidden select-none border-l border-slate-700/60">
      {/* Workspace Top Bar */}
      <div className="h-10 bg-white border-b border-slate-700/60 flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center space-x-2 truncate">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Workspace:
          </span>
          <span className="font-mono text-xs text-slate-800 font-semibold truncate">
            {activeWorkspace.split('/').pop()}
          </span>

          {pendingApprovalsWithDiff.length > 0 && (
            <button
              onClick={() => {
                if (viewingDiffId) {
                  setViewingDiffId(null);
                } else {
                  setViewingDiffId(pendingApprovalsWithDiff[0].id);
                }
              }}
              className={`flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium transition border ${
                viewingDiffId
                  ? 'bg-amber-600 text-white border-amber-500'
                  : 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
              }`}
            >
              <GitCompare className="w-3 h-3" />
              <span>{viewingDiffId ? 'Back to Editor' : `Diff (${pendingApprovalsWithDiff.length})`}</span>
            </button>
          )}
        </div>

        {/* Save & status indicators */}
        <div className="flex items-center space-x-2">
          {activeTab && (
            <div className="flex items-center space-x-1.5 text-[11px] font-mono">
              {activeTab.isDirty ? (
                <span className="text-amber-400 flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span>Unsaved changes</span>
                </span>
              ) : (
                <span className="text-emerald-400/80 flex items-center space-x-1">
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span>Saved</span>
                </span>
              )}
            </div>
          )}

          <button
            onClick={() => setExplorerCollapsed(!explorerCollapsed)}
            className="p-1 hover:bg-navy-800 text-slate-400 hover:text-slate-200 rounded transition text-xs"
            title={explorerCollapsed ? 'Show File Tree' : 'Hide File Tree'}
          >
            <Columns className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main split: File Tree Explorer & Editor/Diff Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Workspace File Explorer */}
        {!explorerCollapsed && (
          <div className="w-56 md:w-60 bg-white border-r border-slate-700/60 flex flex-col shrink-0">
            {/* Explorer Header */}
            <div className="p-2.5 border-b border-slate-700/40 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Explorer
              </span>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setShowNewFileInput(!showNewFileInput)}
                  className="p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-800 transition"
                  title="New File"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onRefreshTree}
                  className="p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-800 transition"
                  title="Refresh Files"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingTree ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* File Filter / Search */}
            <div className="p-2 border-b border-slate-700/40">
              <div className="relative">
                <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={fileSearch}
                  onChange={(e) => setFileSearch(e.target.value)}
                  placeholder="Search files..."
                  className="w-full bg-[#f8f9fd] border border-slate-700/60 focus:border-blue-500 rounded-full pl-7 pr-6 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-none font-mono"
                />
                {fileSearch && (
                  <button
                    onClick={() => setFileSearch('')}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Inline New File input */}
            {showNewFileInput && (
              <form onSubmit={handleCreateSubmit} className="p-2 border-b border-slate-700/40">
                <input
                  type="text"
                  value={newFilePath}
                  onChange={(e) => setNewFilePath(e.target.value)}
                  placeholder="e.g. src/utils.py"
                  className="w-full bg-[#f8f9fd] border border-blue-500 rounded-md px-2 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-none font-mono"
                  autoFocus
                />
              </form>
            )}

            {/* Tree */}
            <div className="flex-1 overflow-y-auto p-2">
              {tree ? (
                <FileTree
                  node={tree}
                  activeFilePath={activeTabPath}
                  searchQuery={fileSearch}
                  onSelectFile={(path) => {
                    setViewingDiffId(null);
                    onSelectTab(path);
                  }}
                  onDeleteFile={onDeleteFile}
                />
              ) : (
                <div className="text-slate-400 text-xs p-3 text-center">
                  Loading files...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Center: Monaco Editor or Diff Viewer */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {viewingDiffId ? (
            <div className="flex-1 flex flex-col overflow-hidden bg-navy-950 p-4">
              {(() => {
                const diffApproval = approvals.find((a) => a.id === viewingDiffId);
                if (!diffApproval || !diffApproval.diff) {
                  return <div className="text-slate-500 text-xs">Diff not found.</div>;
                }
                return (
                  <div className="flex-1 flex flex-col overflow-hidden space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <GitCompare className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-semibold text-slate-200">
                          Proposed Changes: {diffApproval.target_path}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => onOpenApprovalModal(diffApproval)}
                          className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition"
                        >
                          Review & Decide
                        </button>
                        <button
                          onClick={() => setViewingDiffId(null)}
                          className="px-2.5 py-1 rounded bg-navy-800 hover:bg-navy-700 text-slate-300 text-xs transition"
                        >
                          Close Diff
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      <DiffViewer diffText={diffApproval.diff} filename={diffApproval.target_path || undefined} />
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <EditorArea
              tabs={tabs}
              activeTabPath={activeTabPath}
              onSelectTab={onSelectTab}
              onCloseTab={onCloseTab}
              onChangeContent={onChangeContent}
              onSaveFile={onSaveFile}
              onSelectionChange={onSelectionChange}
            />
          )}

          {/* Bottom Terminal Drawer */}
          <TerminalPanel
            isOpen={terminalOpen}
            onClose={onToggleTerminal}
            onRunCommand={onRunCommand}
            commandResult={commandResult}
            isRunning={isRunningCommand}
          />
        </div>
      </div>
    </div>
  );
};
