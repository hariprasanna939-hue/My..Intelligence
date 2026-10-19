import React, { useState } from 'react';
import {
  ApprovalItem,
  ChatMessage,
  ChatSession,
  CommandResult,
  DocumentMetadata,
  FileNode,
  HealthResponse,
  OpenFileTab,
  TaskPlan,
  ToolActivity,
} from '../types';
import { ViewLayoutMode } from './Header';
import { Sidebar } from './Sidebar';
import { ChatPanel } from './ChatPanel';
import { ProjectWorkspace } from './ProjectWorkspace';
import { MobileWorkspaceNavigation, MobileWorkspaceView } from './MobileWorkspaceNavigation';
import { FileTree } from './FileTree';
import { EditorArea } from './EditorArea';
import { TerminalPanel } from './TerminalPanel';
import { FolderOpen, Plus, RefreshCw, Search } from 'lucide-react';

interface AgentModeLayoutProps {
  sidebarCollapsed: boolean;
  sessions: ChatSession[];
  activeSessionId: string | null;
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

  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
  onSendMessage: (content: string, mode: string) => Promise<void>;
  onStopGeneration: () => void;
  onRetryMessage: (lastUserMessage: string) => void;
  onContinueMessage: () => void;
  activeTabPath?: string;
  selectedCode: string;
  approvals: ApprovalItem[];
  onOpenApprovalModal: (apprv: ApprovalItem) => void;
  chatError: string | null;
  onClearError: () => void;
  activePlan: TaskPlan | null;
  toolActivities: ToolActivity[];
  onRevertApproval: (approvalId: string) => Promise<void>;
  inputDraft: string;
  onChangeInputDraft: (text: string) => void;

  tree: FileNode | null;
  loadingTree: boolean;
  onRefreshTree: () => void;
  onCreateFile: (path: string) => void;
  onDeleteFile: (path: string) => void;
  tabs: OpenFileTab[];
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onChangeContent: (path: string, newContent: string) => void;
  onSaveFile: (path: string) => void;
  onSelectionChange: (code: string) => void;

  terminalOpen: boolean;
  onToggleTerminal: () => void;
  onRunCommand: (commandArgs: string[]) => Promise<void>;
  commandResult: CommandResult | null;
  isRunningCommand: boolean;

  layoutMode: ViewLayoutMode;
  mobileDrawerOpen: boolean;
  onCloseMobileDrawer: () => void;

  // Document attachments
  documents?: DocumentMetadata[];
  onUploadDocument?: (file: File) => Promise<void>;
  onDeleteDocument?: (id: string) => Promise<void>;
  onSummarizeDocument?: (id: string, type: string) => Promise<void>;
  uploadingDocument?: boolean;
  uploadProgressText?: string;
}

export const AgentModeLayout: React.FC<AgentModeLayoutProps> = ({
  sidebarCollapsed,
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

  messages,
  streamingText,
  isStreaming,
  onSendMessage,
  onStopGeneration,
  onRetryMessage,
  onContinueMessage,
  activeTabPath,
  selectedCode,
  approvals,
  onOpenApprovalModal,
  chatError,
  onClearError,
  activePlan,
  toolActivities,
  onRevertApproval,
  inputDraft,
  onChangeInputDraft,

  tree,
  loadingTree,
  onRefreshTree,
  onCreateFile,
  onDeleteFile,
  tabs,
  onSelectTab,
  onCloseTab,
  onChangeContent,
  onSaveFile,
  onSelectionChange,

  terminalOpen,
  onToggleTerminal,
  onRunCommand,
  commandResult,
  isRunningCommand,

  layoutMode,
  mobileDrawerOpen,
  onCloseMobileDrawer,

  documents = [],
  onUploadDocument,
  onDeleteDocument,
  onSummarizeDocument,
  uploadingDocument = false,
  uploadProgressText,
}) => {
  const [mobileView, setMobileView] = useState<MobileWorkspaceView>('chat');
  const [fileSearch, setFileSearch] = useState('');
  const [newFilePath, setNewFilePath] = useState('');
  const [showNewFileInput, setShowNewFileInput] = useState(false);

  const hasDirtyFiles = tabs.some((t) => t.isDirty);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newFilePath.trim()) {
      onCreateFile(newFilePath.trim());
      setNewFilePath('');
      setShowNewFileInput(false);
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden relative">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex shrink-0">
        <Sidebar
          collapsed={sidebarCollapsed}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={onSelectSession}
          onNewSession={onNewSession}
          onDeleteSession={onDeleteSession}
          activeWorkspace={activeWorkspace}
          recentWorkspaces={recentWorkspaces}
          onOpenWorkspaceModal={onOpenWorkspaceModal}
          onSelectWorkspace={onSelectWorkspace}
          health={health}
          onOpenSettings={onOpenSettings}
          pendingApprovalsCount={pendingApprovalsCount}
          onOpenApprovals={onOpenApprovals}
        />
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileDrawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden flex"
          onClick={onCloseMobileDrawer}
        >
          <div
            className="w-72 bg-navy-900 h-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Sidebar
              collapsed={false}
              sessions={sessions}
              activeSessionId={activeSessionId}
              onSelectSession={(id) => {
                onSelectSession(id);
                onCloseMobileDrawer();
              }}
              onNewSession={() => {
                onNewSession();
                onCloseMobileDrawer();
              }}
              onDeleteSession={onDeleteSession}
              activeWorkspace={activeWorkspace}
              recentWorkspaces={recentWorkspaces}
              onOpenWorkspaceModal={() => {
                onOpenWorkspaceModal();
                onCloseMobileDrawer();
              }}
              onSelectWorkspace={(p) => {
                onSelectWorkspace(p);
                onCloseMobileDrawer();
              }}
              health={health}
              onOpenSettings={() => {
                onOpenSettings();
                onCloseMobileDrawer();
              }}
              pendingApprovalsCount={pendingApprovalsCount}
              onOpenApprovals={() => {
                onOpenApprovals();
                onCloseMobileDrawer();
              }}
            />
          </div>
        </div>
      )}

      {/* Desktop Content Area (Split / Multi-panel) */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        {/* Main Chat Area */}
        {(layoutMode === 'split' || layoutMode === 'chat-only') && (
          <div
            className={`flex flex-col overflow-hidden ${
              layoutMode === 'split' ? 'w-full md:w-1/2 lg:w-[48%] border-r border-navy-800' : 'w-full'
            }`}
          >
            <ChatPanel
              messages={messages}
              streamingText={streamingText}
              isStreaming={isStreaming}
              onSendMessage={onSendMessage}
              onStopGeneration={onStopGeneration}
              onRetryMessage={onRetryMessage}
              onContinueMessage={onContinueMessage}
              activeFilePath={activeTabPath}
              activeWorkspace={activeWorkspace}
              hasSelectedCode={!!selectedCode.trim()}
              onOpenApprovalModal={onOpenApprovalModal}
              approvals={approvals}
              onOpenWorkspaceModal={onOpenWorkspaceModal}
              error={chatError}
              onClearError={onClearError}
              activePlan={activePlan}
              toolActivities={toolActivities}
              onRevertApproval={onRevertApproval}
              inputDraft={inputDraft}
              onChangeInputDraft={onChangeInputDraft}
              documents={documents}
              onUploadDocument={onUploadDocument}
              onDeleteDocument={onDeleteDocument}
              onSummarizeDocument={onSummarizeDocument}
              uploadingDocument={uploadingDocument}
              uploadProgressText={uploadProgressText}
            />
          </div>
        )}

        {/* Project Workspace (Editor, Files, Diff, Terminal) */}
        {(layoutMode === 'split' || layoutMode === 'code-only') && (
          <div
            className={`flex flex-col overflow-hidden ${
              layoutMode === 'split' ? 'flex-1' : 'w-full'
            }`}
          >
            <ProjectWorkspace
              activeWorkspace={activeWorkspace}
              tree={tree}
              loadingTree={loadingTree}
              onRefreshTree={onRefreshTree}
              onCreateFile={onCreateFile}
              onDeleteFile={onDeleteFile}
              tabs={tabs}
              activeTabPath={activeTabPath}
              onSelectTab={onSelectTab}
              onCloseTab={onCloseTab}
              onChangeContent={onChangeContent}
              onSaveFile={onSaveFile}
              onSelectionChange={onSelectionChange}
              approvals={approvals}
              onOpenApprovalModal={onOpenApprovalModal}
              terminalOpen={terminalOpen}
              onToggleTerminal={onToggleTerminal}
              onRunCommand={onRunCommand}
              commandResult={commandResult}
              isRunningCommand={isRunningCommand}
              onOpenWorkspaceModal={onOpenWorkspaceModal}
            />
          </div>
        )}
      </div>

      {/* Mobile Content Area (<768px): Single View Focused with Bottom Navigation */}
      <div className="flex flex-col flex-1 overflow-hidden md:hidden">
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Mobile View 1: Agent Chat & Plan */}
          {mobileView === 'chat' && (
            <ChatPanel
              messages={messages}
              streamingText={streamingText}
              isStreaming={isStreaming}
              onSendMessage={onSendMessage}
              onStopGeneration={onStopGeneration}
              onRetryMessage={onRetryMessage}
              onContinueMessage={onContinueMessage}
              activeFilePath={activeTabPath}
              activeWorkspace={activeWorkspace}
              hasSelectedCode={!!selectedCode.trim()}
              onOpenApprovalModal={onOpenApprovalModal}
              approvals={approvals}
              onOpenWorkspaceModal={onOpenWorkspaceModal}
              error={chatError}
              onClearError={onClearError}
              activePlan={activePlan}
              toolActivities={toolActivities}
              onRevertApproval={onRevertApproval}
              inputDraft={inputDraft}
              onChangeInputDraft={onChangeInputDraft}
              documents={documents}
              onUploadDocument={onUploadDocument}
              onDeleteDocument={onDeleteDocument}
              onSummarizeDocument={onSummarizeDocument}
              uploadingDocument={uploadingDocument}
              uploadProgressText={uploadProgressText}
            />
          )}

          {/* Mobile View 2: Files Browser */}
          {mobileView === 'files' && (
            <div className="flex-1 flex flex-col bg-navy-950 overflow-hidden p-3">
              <div className="flex items-center justify-between mb-3 shrink-0">
                <div className="flex items-center space-x-2">
                  <FolderOpen className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                    {activeWorkspace ? activeWorkspace.split('/').pop() : 'Files'}
                  </span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => setShowNewFileInput(!showNewFileInput)}
                    className="p-1 rounded bg-navy-900 hover:bg-navy-800 text-slate-400 hover:text-slate-200 transition border border-navy-700/80"
                    title="New File"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={onRefreshTree}
                    className="p-1 rounded bg-navy-900 hover:bg-navy-800 text-slate-400 hover:text-slate-200 transition border border-navy-700/80"
                    title="Refresh Tree"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingTree ? 'animate-spin text-blue-400' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Quick file search */}
              <div className="relative mb-3 shrink-0">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter files..."
                  value={fileSearch}
                  onChange={(e) => setFileSearch(e.target.value)}
                  className="w-full bg-navy-900 border border-navy-700/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              {showNewFileInput && (
                <form onSubmit={handleCreateSubmit} className="mb-3 shrink-0 flex items-center space-x-1.5">
                  <input
                    type="text"
                    placeholder="filename.py or path/file.ts"
                    value={newFilePath}
                    onChange={(e) => setNewFilePath(e.target.value)}
                    className="flex-1 bg-navy-900 border border-navy-700 rounded px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1 rounded bg-blue-600 text-white text-xs font-medium"
                  >
                    Create
                  </button>
                </form>
              )}

              <div className="flex-1 overflow-y-auto rounded-xl bg-navy-900/60 border border-navy-800 p-2">
                {tree ? (
                  <FileTree
                    node={tree}
                    onSelectFile={(path) => {
                      onSelectTab(path);
                      setMobileView('editor');
                    }}
                    onDeleteFile={onDeleteFile}
                    activeFilePath={activeTabPath}
                    searchQuery={fileSearch}
                  />
                ) : (
                  <div className="p-4 text-center text-xs text-slate-500">
                    No workspace active. Tap Menu to open a project.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Mobile View 3: Code Editor */}
          {mobileView === 'editor' && (
            <div className="flex-1 flex flex-col bg-navy-950 overflow-hidden">
              <EditorArea
                tabs={tabs}
                activeTabPath={activeTabPath}
                onSelectTab={onSelectTab}
                onCloseTab={onCloseTab}
                onChangeContent={onChangeContent}
                onSaveFile={onSaveFile}
                onSelectionChange={onSelectionChange}
              />
            </div>
          )}

          {/* Mobile View 4: Terminal / Output */}
          {mobileView === 'terminal' && (
            <div className="flex-1 flex flex-col bg-navy-950 overflow-hidden">
              <TerminalPanel
                isOpen={true}
                onClose={() => setMobileView('chat')}
                onRunCommand={onRunCommand}
                commandResult={commandResult}
                isRunning={isRunningCommand}
              />
            </div>
          )}
        </div>

        {/* Mobile Workspace Navigation Tab Bar */}
        <MobileWorkspaceNavigation
          activeView={mobileView}
          onChangeView={setMobileView}
          hasDirtyFiles={hasDirtyFiles}
          isRunningCommand={isRunningCommand}
          pendingApprovalsCount={pendingApprovalsCount}
        />
      </div>
    </div>
  );
};
