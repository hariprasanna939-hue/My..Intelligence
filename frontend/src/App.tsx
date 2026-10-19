import React, { useState, useEffect, useCallback } from 'react';
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

import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { EditorArea } from './components/EditorArea';
import { ChatPanel } from './components/ChatPanel';
import { TerminalPanel } from './components/TerminalPanel';
import { ApprovalModal } from './components/ApprovalModal';
import { SettingsModal } from './components/SettingsModal';
import { WorkspaceModal } from './components/WorkspaceModal';

// Initialize Monaco Editor offline bundle
initMonacoOffline();

export const App: React.FC = () => {
  // App state
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [activeWorkspace, setActiveWorkspace] = useState<string | null>(null);

  // File tree & editor tabs
  const [tree, setTree] = useState<FileNode | null>(null);
  const [loadingTree, setLoadingTree] = useState(false);
  const [tabs, setTabs] = useState<OpenFileTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | undefined>(undefined);
  const [selectedCode, setSelectedCode] = useState<string>('');

  // Chat & Agent
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

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

  // 1. Initial Load
  const loadInitialData = useCallback(async () => {
    try {
      const [hData, sData, wsData, sessData, apprvData] = await Promise.all([
        api.getHealth(),
        api.getSettings(),
        api.getWorkspace(),
        api.listSessions(),
        api.listApprovals(),
      ]);

      setHealth(hData);
      setSettings(sData);
      setActiveWorkspace(wsData.active_workspace);
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
    setTabs([]);
    setActiveTabPath(undefined);
  };

  // 6. Chat Actions & Streaming
  const handleSendMessage = async (content: string, mode: string) => {
    setIsStreaming(true);
    setStreamingText('');

    let currentSessionId = activeSessionId;
    if (!currentSessionId) {
      const sess = await api.createSession(content.slice(0, 30));
      currentSessionId = sess.id;
      setActiveSessionId(sess.id);
      setSessions((prev) => [sess, ...prev]);
    }

    // Optimistically add user message
    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      session_id: currentSessionId,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    let fullAssistantText = '';

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
            fullAssistantText += chunk;
            setStreamingText((prev) => prev + chunk);
          },
          onApprovals: (newApprovals) => {
            setApprovals((prev) => [...newApprovals, ...prev]);
            // If there's a proposed approval, automatically open review
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
            alert(`AI generation error: ${err}`);
          },
        }
      );
    } catch (err: any) {
      setIsStreaming(false);
      setStreamingText('');
      alert(`Chat error: ${err.message}`);
    }
  };

  const handleNewSession = async () => {
    try {
      const sess = await api.createSession('New Session');
      setSessions((prev) => [sess, ...prev]);
      setActiveSessionId(sess.id);
    } catch (err: any) {
      alert(`Could not create session: ${err.message}`);
    }
  };

  const handleDeleteSession = async (id: string) => {
    try {
      await api.deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeSessionId === id) {
        setActiveSessionId(sessions.find((s) => s.id !== id)?.id || null);
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

      // If approved file write, reload opened tab if active or reload tree
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

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-editor-bg text-zinc-100 font-sans">
      {/* Top Application Header */}
      <Header
        health={health}
        activeWorkspace={activeWorkspace}
        pendingApprovalsCount={pendingApprovalsCount}
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
      />

      {/* Main Workspace Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          tree={tree}
          loadingTree={loadingTree}
          activeFilePath={activeTabPath}
          onSelectFile={handleSelectFile}
          onRefreshTree={refreshTree}
          onCreateFile={handleCreateFile}
          onDeleteFile={handleDeleteFile}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={setActiveSessionId}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          approvals={approvals}
          onOpenApprovalModal={(apprv) => setSelectedApproval(apprv)}
        />

        {/* Center: Monaco Editor & Bottom Terminal */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <EditorArea
            tabs={tabs}
            activeTabPath={activeTabPath}
            onSelectTab={setActiveTabPath}
            onCloseTab={handleCloseTab}
            onChangeContent={handleChangeContent}
            onSaveFile={handleSaveFile}
            onSelectionChange={setSelectedCode}
          />

          <TerminalPanel
            isOpen={terminalOpen}
            onClose={() => setTerminalOpen(false)}
            onRunCommand={handleRunCommand}
            commandResult={commandResult}
            isRunning={isRunningCommand}
          />
        </div>

        {/* Right Panel: AI Coding Chat */}
        <ChatPanel
          messages={messages}
          streamingText={streamingText}
          isStreaming={isStreaming}
          onSendMessage={handleSendMessage}
          activeFilePath={activeTabPath}
          hasSelectedCode={!!selectedCode.trim()}
          onOpenApprovalModal={(apprv) => setSelectedApproval(apprv)}
          approvals={approvals}
        />
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
        onSelectWorkspace={handleSelectWorkspace}
      />
    </div>
  );
};

export default App;
