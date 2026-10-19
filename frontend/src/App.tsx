import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from './services/api';
import {
  AppSettings,
  AppWorkingMode,
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
} from './types';
import { detectLanguage, initMonacoOffline } from './monaco';

import { Header, ViewLayoutMode } from './components/Header';
import { ChatModeLayout } from './components/ChatModeLayout';
import { AgentModeLayout } from './components/AgentModeLayout';
import { ApprovalModal } from './components/ApprovalModal';
import { SettingsModal } from './components/SettingsModal';
import { WorkspaceModal } from './components/WorkspaceModal';

// Initialize Monaco Editor offline bundle
initMonacoOffline();

export const App: React.FC = () => {
  // Working Mode state ('chat' | 'agent') with localStorage persistence
  const [appMode, setAppMode] = useState<AppWorkingMode>(() => {
    try {
      const saved = localStorage.getItem('forgelocal_app_mode');
      if (saved === 'chat' || saved === 'agent') return saved;
    } catch {
      // ignore
    }
    return 'chat';
  });

  const handleModeChange = (newMode: AppWorkingMode) => {
    setAppMode(newMode);
    try {
      localStorage.setItem('forgelocal_app_mode', newMode);
    } catch {
      // ignore
    }
  };

  // Shared Unsent Prompt Draft across mode switches
  const [inputDraft, setInputDraft] = useState('');

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
  const [activePlan, setActivePlan] = useState<TaskPlan | null>(null);
  const [toolActivities, setToolActivities] = useState<ToolActivity[]>([]);
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

  // Document Management State
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState('');

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

  // 3. Load Session Messages & Attached Documents when activeSessionId changes
  const refreshDocuments = useCallback(async () => {
    if (!activeSessionId) {
      setDocuments([]);
      return;
    }
    try {
      const docs = await api.listDocuments(activeSessionId);
      setDocuments(docs);
    } catch (err) {
      console.error('Failed to load session documents:', err);
    }
  }, [activeSessionId]);

  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      setDocuments([]);
      return;
    }
    api.getSessionMessages(activeSessionId)
      .then(setMessages)
      .catch((err) => console.error('Failed to load session messages:', err));

    refreshDocuments();
  }, [activeSessionId, refreshDocuments]);

  // Document Handlers
  const handleUploadDocument = async (file: File) => {
    setUploadingDocument(true);
    setUploadProgressText(`Uploading and validating ${file.name}...`);
    try {
      setUploadProgressText(`Extracting readable text from ${file.name}...`);
      const newDoc = await api.uploadDocument(file, activeSessionId || undefined);
      setUploadProgressText(`Indexing chunks with SQLite FTS5...`);
      await refreshDocuments();
      setDocuments((prev) => {
        const filtered = prev.filter((d) => d.id !== newDoc.id);
        return [newDoc, ...filtered];
      });
    } catch (err: any) {
      alert(`Document processing failed: ${err.message}`);
    } finally {
      setUploadingDocument(false);
      setUploadProgressText('');
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    try {
      await api.deleteDocument(docId);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } catch (err: any) {
      alert(`Could not delete document: ${err.message}`);
    }
  };

  const handleSummarizeDocument = async (docId: string, summaryType: string) => {
    try {
      const doc = documents.find((d) => d.id === docId);
      const docTitle = doc ? doc.filename : 'Document';
      // Automatically send prompt or request summary
      const res = await api.summarizeDocument(docId, summaryType);
      
      // Inject model response message directly into the chat session
      const summaryMsgContent = `### Summary of ${docTitle} (${res.summary_type})\n\n${res.summary}`;
      handleSendMessage(`Summarize document: ${docTitle} (${summaryType})`, 'chat');
    } catch (err: any) {
      alert(`Failed to generate summary: ${err.message}`);
    }
  };

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
    setActivePlan(null);
    setToolActivities([]);

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

    const isChatMode = appMode === 'chat';
    try {
      await api.streamChatMessage(
        {
          content,
          session_id: currentSessionId,
          mode: isChatMode ? 'chat' : mode,
          current_file_path: isChatMode ? undefined : activeTabPath,
          selected_code: isChatMode ? undefined : (selectedCode || undefined),
          workspace_path: isChatMode ? undefined : (activeWorkspace || undefined),
        },
        {
          onPlan: (plan) => {
            setActivePlan(plan);
          },
          onPlanUpdate: (planUp) => {
            setActivePlan((prev) => (prev ? { ...prev, status: planUp.status as any } : null));
          },
          onToolStart: (tool) => {
            setToolActivities((prev) => [
              ...prev,
              { tool: tool.tool, args: tool.args, iteration: tool.iteration, status: 'running' },
            ]);
          },
          onToolResult: (toolRes) => {
            setToolActivities((prev) =>
              prev.map((t) =>
                t.tool === toolRes.tool && t.iteration === toolRes.iteration
                  ? { ...t, result: toolRes.result, status: 'completed' }
                  : t
              )
            );
          },
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

  const handleRevertApproval = async (approvalId: string) => {
    try {
      await api.revertApproval(approvalId);
      const apprvs = await api.listApprovals();
      setApprovals(apprvs);
      await refreshTree();
      if (activeTabPath) {
        handleSelectFile(activeTabPath);
      }
    } catch (err: any) {
      alert(`Revert failed: ${err.message}`);
    }
  };

  const handleClearHistory = async () => {
    try {
      await api.clearHistory();
      setSessions([]);
      setActiveSessionId(null);
      setMessages([]);
      setApprovals([]);
      setActivePlan(null);
      setToolActivities([]);
    } catch (err: any) {
      alert(`Clear history failed: ${err.message}`);
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
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-reference-gradient text-[#1e1b4b] font-sans">
      {/* Top Application Header */}
      <Header
        appMode={appMode}
        onChangeAppMode={handleModeChange}
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

      {/* Main Workspace Body according to appMode */}
      {appMode === 'chat' ? (
        <ChatModeLayout
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={setActiveSessionId}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          messages={messages}
          streamingText={streamingText}
          isStreaming={isStreaming}
          onSendMessage={handleSendMessage}
          onStopGeneration={handleStopGeneration}
          onRetryMessage={handleRetryMessage}
          onContinueMessage={handleContinueMessage}
          inputDraft={inputDraft}
          onChangeInputDraft={setInputDraft}
          health={health}
          error={chatError}
          onClearError={() => setChatError(null)}
          documents={documents}
          onUploadDocument={handleUploadDocument}
          onDeleteDocument={handleDeleteDocument}
          onSummarizeDocument={handleSummarizeDocument}
          uploadingDocument={uploadingDocument}
          uploadProgressText={uploadProgressText}
        />
      ) : (
        <AgentModeLayout
          sidebarCollapsed={sidebarCollapsed}
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
            if (firstPending) {
              setSelectedApproval(firstPending);
            } else {
              alert('No pending approvals at this time.');
            }
          }}
          messages={messages}
          streamingText={streamingText}
          isStreaming={isStreaming}
          onSendMessage={handleSendMessage}
          onStopGeneration={handleStopGeneration}
          onRetryMessage={handleRetryMessage}
          onContinueMessage={handleContinueMessage}
          activeTabPath={activeTabPath}
          selectedCode={selectedCode}
          approvals={approvals}
          onOpenApprovalModal={(apprv) => setSelectedApproval(apprv)}
          chatError={chatError}
          onClearError={() => setChatError(null)}
          activePlan={activePlan}
          toolActivities={toolActivities}
          onRevertApproval={handleRevertApproval}
          inputDraft={inputDraft}
          onChangeInputDraft={setInputDraft}
          tree={tree}
          loadingTree={loadingTree}
          onRefreshTree={refreshTree}
          onCreateFile={handleCreateFile}
          onDeleteFile={handleDeleteFile}
          tabs={tabs}
          onSelectTab={handleSelectFile}
          onCloseTab={handleCloseTab}
          onChangeContent={handleChangeContent}
          onSaveFile={handleSaveFile}
          onSelectionChange={setSelectedCode}
          terminalOpen={terminalOpen}
          onToggleTerminal={() => setTerminalOpen(!terminalOpen)}
          onRunCommand={handleRunCommand}
          commandResult={commandResult}
          isRunningCommand={isRunningCommand}
          layoutMode={layoutMode}
          mobileDrawerOpen={mobileDrawerOpen}
          onCloseMobileDrawer={() => setMobileDrawerOpen(false)}
          documents={documents}
          onUploadDocument={handleUploadDocument}
          onDeleteDocument={handleDeleteDocument}
          onSummarizeDocument={handleSummarizeDocument}
          uploadingDocument={uploadingDocument}
          uploadProgressText={uploadProgressText}
        />
      )}

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
        onClearHistory={handleClearHistory}
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
