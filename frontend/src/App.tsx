import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from './services/api';
import {
  AppSettings,
  ApprovalItem,
  ChatMessage,
  ChatSession,
  CommandResult,
  FileNode,
  HealthResponse,
  OpenFileTab,
} from './types';
import { detectLanguage, initMonacoOffline } from './monaco';

import { Header, ViewLayoutMode } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { ProjectWorkspace } from './components/ProjectWorkspace';
import { ApprovalModal } from './components/ApprovalModal';
import { SettingsModal } from './components/SettingsModal';
import { WorkspaceModal } from './components/WorkspaceModal';

// Initialize Monaco Editor offline bundle
initMonacoOffline();

export const App: React.FC = () => {
  // App environment state
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [activeWorkspace, setActiveWorkspace] = useState<string | null>(null);
  const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>([]);

  // Layout & Responsive state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState<ViewLayoutMode>('split');

  // File tree & editor tabs
  const [tree, setTree] = useState<FileNode | null>(null);
  const [loadingTree, setLoadingTree] = useState(false);
  const [tabs, setTabs] = useState<OpenFileTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | undefined>(undefined);
  const [selectedCode, setSelectedCode] = useState<string>('');

  // Chat & Agent state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Approvals & Audits
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [selectedApproval, setSelectedApproval] = useState<ApprovalItem | null>(null);
  const [resolvingApproval, setResolvingApproval] = useState(false);

  // Terminal & Commands
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [commandResult, setCommandResult] = useState<CommandResult | null>(null);
  const [isRunningCommand, setIsRunningCommand] = useState(false);

  // Modals
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  // 1. Initial Load of environment, sessions, recents
  const loadInitialData = useCallback(async () => {
    try {
      const [hData, sData, wsData, recents, sessData, apprvData] = await Promise.all([
        api.getHealth(),
        api.getSettings(),
        api.getWorkspace(),
        api.getRecentWorkspaces(),
        api.listSessions(),
        api.listApprovals(),
      ]);

      setHealth(hData);
      setSettings(sData);
      setActiveWorkspace(wsData.active_workspace);
      setRecentWorkspaces(recents);
      setSessions(sessData);
      setApprovals(apprvData);

      if (sessData.length > 0 && !activeSessionId) {
        setActiveSessionId(sessData[0].id);
      }
    } catch (err) {
      console.error('Initial data fetch failed:', err);
    }
  }, [activeSessionId]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // 2. Load File Tree when workspace changes
  const refreshTree = useCallback(async () => {
    if (!activeWorkspace) {
      setTree(null);
      return;
    }
    setLoadingTree(true);
    try {
      const treeData = await api.getWorkspaceTree();
      setTree(treeData);
    } catch (err) {
      console.error('Failed to load workspace tree:', err);
    } finally {
      setLoadingTree(false);
    }
  }, [activeWorkspace]);

  useEffect(() => {
    refreshTree();
  }, [refreshTree]);

  // 3. Load Session Messages when activeSessionId changes
  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      return;
    }
    api.getSessionMessages(activeSessionId)
      .then(setMessages)
      .catch((err) => console.error('Failed to load session messages:', err));
  }, [activeSessionId]);

  // 4. File Actions
  const handleSelectFile = async (path: string) => {
    const existing = tabs.find((t) => t.path === path);
    if (existing) {
      setActiveTabPath(path);
      return;
    }

    try {
      const fileData = await api.readFile(path);
      const newTab: OpenFileTab = {
        path,
        name: path.split('/').pop() || path,
        content: fileData.content,
        originalContent: fileData.content,
        isDirty: false,
        language: detectLanguage(path),
      };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabPath(path);
    } catch (err: any) {
      alert(`Could not open file: ${err.message}`);
    }
  };

  const handleCloseTab = (path: string) => {
    setTabs((prev) => {
      const nextTabs = prev.filter((t) => t.path !== path);
      if (activeTabPath === path) {
        setActiveTabPath(nextTabs[nextTabs.length - 1]?.path);
      }
      return nextTabs;
    });
  };

  const handleChangeContent = (path: string, newContent: string) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.path === path
          ? {
              ...tab,
              content: newContent,
              isDirty: newContent !== tab.originalContent,
            }
          : tab
      )
    );
  };

  const handleSaveFile = async (path: string) => {
    const tab = tabs.find((t) => t.path === path);
    if (!tab) return;
    try {
      await api.saveFile(path, tab.content);
      setTabs((prev) =>
        prev.map((t) =>
          t.path === path
            ? { ...t, originalContent: tab.content, isDirty: false }
            : t
        )
      );
    } catch (err: any) {
      alert(`Failed to save file: ${err.message}`);
    }
  };

  const handleCreateFile = async (newPath: string) => {
    try {
      await api.saveFile(newPath, '');
      await refreshTree();
      handleSelectFile(newPath);
    } catch (err: any) {
      alert(`Could not create file: ${err.message}`);
    }
  };

  const handleDeleteFile = async (path: string) => {
    try {
      await api.deleteFile(path);
      handleCloseTab(path);
      await refreshTree();
    } catch (err: any) {
      alert(`Could not delete file: ${err.message}`);
    }
  };

  // 5. Workspace Selection
  const handleSelectWorkspace = async (newPath: string) => {
    const res = await api.setWorkspace(newPath);
    setActiveWorkspace(res.active_workspace);
    if (res.recent_workspaces) {
      setRecentWorkspaces(res.recent_workspaces);
    }
    setTabs([]);
    setActiveTabPath(undefined);
  };

  // 6. Chat Actions & Streaming with Stop Generation
  const handleSendMessage = async (content: string, mode: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsStreaming(true);
    setStreamingText('');
    setChatError(null);

    let currentSessionId = activeSessionId;
    if (!currentSessionId) {
      const sess = await api.createSession(content.slice(0, 30));
      currentSessionId = sess.id;
      setActiveSessionId(sess.id);
      setSessions((prev) => [sess, ...prev]);
    }

    // Optimistically append user message
    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      session_id: currentSessionId,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      await api.streamChatMessage(
        {
          content,
          session_id: currentSessionId,
          mode,
          current_file_path: activeTabPath,
          selected_code: selectedCode || undefined,
        },
        {
          onChunk: (chunk) => {
            setStreamingText((prev) => prev + chunk);
          },
          onApprovals: (newApprovals) => {
            setApprovals((prev) => [...newApprovals, ...prev]);
            if (newApprovals.length > 0) {
              setSelectedApproval(newApprovals[0]);
            }
          },
          onDone: async () => {
            setIsStreaming(false);
            setStreamingText('');
            if (currentSessionId) {
              const msgs = await api.getSessionMessages(currentSessionId);
              setMessages(msgs);
            }
          },
          onError: (err) => {
            setIsStreaming(false);
            setStreamingText('');
            setChatError(err);
          },
        },
        abortController.signal
      );
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setIsStreaming(false);
        setStreamingText('');
        setChatError(err.message || 'Chat generation failed');
      }
    }
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    if (streamingText && activeSessionId) {
      // Save partial message or reload
      api.getSessionMessages(activeSessionId).then(setMessages);
    }
    setStreamingText('');
  };

  const handleRetryMessage = (lastUserMessage: string) => {
    if (!isStreaming) {
      handleSendMessage(lastUserMessage, 'chat');
    }
  };

  const handleContinueMessage = () => {
    if (!isStreaming) {
      handleSendMessage('Please continue from where you left off.', 'chat');
    }
  };

  const handleNewSession = async () => {
    try {
      const sess = await api.createSession('New Session');
      setSessions((prev) => [sess, ...prev]);
      setActiveSessionId(sess.id);
      setMessages([]);
      setStreamingText('');
    } catch (err: any) {
      alert(`Could not create session: ${err.message}`);
    }
  };

  const handleDeleteSession = async (id: string) => {
    try {
      await api.deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeSessionId === id) {
        const remaining = sessions.filter((s) => s.id !== id);
        setActiveSessionId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (err: any) {
      alert(`Could not delete session: ${err.message}`);
    }
  };

  // 7. Approvals Handling
  const handleDecideApproval = async (id: string, decision: 'approve' | 'reject') => {
    setResolvingApproval(true);
    try {
      const updated = await api.decideApproval(id, decision);
      setApprovals((prev) => prev.map((a) => (a.id === id ? updated : a)));
      setSelectedApproval(updated);

      if (decision === 'approve') {
        await refreshTree();
        if (updated.target_path) {
          const tab = tabs.find((t) => t.path === updated.target_path);
          if (tab) {
            const reloaded = await api.readFile(updated.target_path);
            setTabs((prev) =>
              prev.map((t) =>
                t.path === updated.target_path
                  ? {
                      ...t,
                      content: reloaded.content,
                      originalContent: reloaded.content,
                      isDirty: false,
                    }
                  : t
              )
            );
          }
        }
      }
    } catch (err: any) {
      alert(`Failed to resolve approval: ${err.message}`);
    } finally {
      setResolvingApproval(false);
    }
  };

  // 8. Controlled Commands Execution
  const handleRunCommand = async (commandArgs: string[]) => {
    setIsRunningCommand(true);
    setTerminalOpen(true);
    try {
      const res = await api.runCommand(commandArgs);
      setCommandResult(res);
    } catch (err: any) {
      setCommandResult({
        command: commandArgs.join(' '),
        return_code: 1,
        stdout: '',
        stderr: err.message || 'Execution error',
        execution_time_ms: 0,
        timed_out: false,
      });
    } finally {
      setIsRunningCommand(false);
    }
  };

  // 9. Update Settings
  const handleSaveSettings = async (updated: Partial<AppSettings>) => {
    const res = await api.updateSettings(updated);
    setSettings(res);
    const hData = await api.getHealth();
    setHealth(hData);
  };

  const pendingApprovalsCount = approvals.filter((a) => a.status === 'pending').length;
  const currentSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-navy-950 text-slate-100 font-sans">
      {/* Top Application Header */}
      <Header
        health={health}
        activeWorkspace={activeWorkspace}
        activeConversationTitle={currentSession?.title}
        pendingApprovalsCount={pendingApprovalsCount}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
        onOpenWorkspaceModal={() => setWorkspaceModalOpen(true)}
        onOpenApprovals={() => {
          const firstPending = approvals.find((a) => a.status === 'pending') || approvals[0];
          if (firstPending) {
            setSelectedApproval(firstPending);
          } else {
            alert('No pending approvals at this time.');
          }
        }}
        onOpenSettings={() => setSettingsModalOpen(true)}
        onToggleTerminal={() => setTerminalOpen(!terminalOpen)}
        terminalOpen={terminalOpen}
        layoutMode={layoutMode}
        onChangeLayoutMode={setLayoutMode}
        onToggleMobileDrawer={() => setMobileDrawerOpen(!mobileDrawerOpen)}
      />

      {/* Main App Container */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Desktop Sidebar */}
        <div className="hidden md:flex shrink-0">
          <Sidebar
            collapsed={sidebarCollapsed}
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={setActiveSessionId}
            onNewSession={handleNewSession}
            onDeleteSession={handleDeleteSession}
            activeWorkspace={activeWorkspace}
            recentWorkspaces={recentWorkspaces}
            onOpenWorkspaceModal={() => setWorkspaceModalOpen(true)}
            onSelectWorkspace={handleSelectWorkspace}
            health={health}
            onOpenSettings={() => setSettingsModalOpen(true)}
            pendingApprovalsCount={pendingApprovalsCount}
            onOpenApprovals={() => {
              const firstPending = approvals.find((a) => a.status === 'pending') || approvals[0];
              if (firstPending) setSelectedApproval(firstPending);
            }}
          />
        </div>

        {/* Mobile Drawer Overlay */}
        {mobileDrawerOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden flex"
            onClick={() => setMobileDrawerOpen(false)}
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
                  setActiveSessionId(id);
                  setMobileDrawerOpen(false);
                }}
                onNewSession={() => {
                  handleNewSession();
                  setMobileDrawerOpen(false);
                }}
                onDeleteSession={handleDeleteSession}
                activeWorkspace={activeWorkspace}
                recentWorkspaces={recentWorkspaces}
                onOpenWorkspaceModal={() => {
                  setWorkspaceModalOpen(true);
                  setMobileDrawerOpen(false);
                }}
                onSelectWorkspace={(p) => {
                  handleSelectWorkspace(p);
                  setMobileDrawerOpen(false);
                }}
                health={health}
                onOpenSettings={() => {
                  setSettingsModalOpen(true);
                  setMobileDrawerOpen(false);
                }}
                pendingApprovalsCount={pendingApprovalsCount}
                onOpenApprovals={() => {
                  const firstPending = approvals.find((a) => a.status === 'pending') || approvals[0];
                  if (firstPending) setSelectedApproval(firstPending);
                  setMobileDrawerOpen(false);
                }}
              />
            </div>
          </div>
        )}

        {/* Content Area according to LayoutMode */}
        <div className="flex-1 flex overflow-hidden">
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
                onSendMessage={handleSendMessage}
                onStopGeneration={handleStopGeneration}
                onRetryMessage={handleRetryMessage}
                onContinueMessage={handleContinueMessage}
                activeFilePath={activeTabPath}
                activeWorkspace={activeWorkspace}
                hasSelectedCode={!!selectedCode.trim()}
                onOpenApprovalModal={(apprv) => setSelectedApproval(apprv)}
                approvals={approvals}
                onOpenWorkspaceModal={() => setWorkspaceModalOpen(true)}
                error={chatError}
                onClearError={() => setChatError(null)}
              />
            </div>
          )}

          {/* Project Workspace (Editor, Files, Diff, Terminal) */}
          {(layoutMode === 'split' || layoutMode === 'code-only') && (
            <div
              className={`flex flex-col overflow-hidden ${
                layoutMode === 'split' ? 'hidden md:flex flex-1' : 'w-full'
              }`}
            >
              <ProjectWorkspace
                activeWorkspace={activeWorkspace}
                tree={tree}
                loadingTree={loadingTree}
                onRefreshTree={refreshTree}
                onCreateFile={handleCreateFile}
                onDeleteFile={handleDeleteFile}
                tabs={tabs}
                activeTabPath={activeTabPath}
                onSelectTab={handleSelectFile}
                onCloseTab={handleCloseTab}
                onChangeContent={handleChangeContent}
                onSaveFile={handleSaveFile}
                onSelectionChange={setSelectedCode}
                approvals={approvals}
                onOpenApprovalModal={(apprv) => setSelectedApproval(apprv)}
                terminalOpen={terminalOpen}
                onToggleTerminal={() => setTerminalOpen(!terminalOpen)}
                onRunCommand={handleRunCommand}
                commandResult={commandResult}
                isRunningCommand={isRunningCommand}
                onOpenWorkspaceModal={() => setWorkspaceModalOpen(true)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Modals & Dialogs */}
      <ApprovalModal
        approval={selectedApproval}
        isOpen={!!selectedApproval}
        onClose={() => setSelectedApproval(null)}
        onDecide={handleDecideApproval}
        resolving={resolvingApproval}
      />

      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        settings={settings}
        availableModels={health?.available_models || []}
        onSave={handleSaveSettings}
      />

      <WorkspaceModal
        isOpen={workspaceModalOpen}
        onClose={() => setWorkspaceModalOpen(false)}
        currentWorkspace={activeWorkspace}
        recentWorkspaces={recentWorkspaces}
        onSelectWorkspace={handleSelectWorkspace}
      />
    </div>
  );
};

export default App;
