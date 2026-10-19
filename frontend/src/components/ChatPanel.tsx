import React, { useEffect, useRef, useState } from 'react';
import {
  Send,
  Square,
  Sparkles,
  ShieldAlert,
  Bot,
  User,
  RotateCcw,
  Play,
  FileCode,
  X,
  AlertCircle,
  CornerDownLeft,
} from 'lucide-react';
import { ApprovalItem, ChatMessage } from '../types';
import { WelcomeScreen } from './WelcomeScreen';
import { MarkdownMessage } from './MarkdownMessage';

interface ChatPanelProps {
  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
  onSendMessage: (content: string, mode: string) => Promise<void>;
  onStopGeneration: () => void;
  onRetryMessage: (lastUserMessage: string) => void;
  onContinueMessage: () => void;
  activeFilePath?: string;
  activeWorkspace: string | null;
  hasSelectedCode?: boolean;
  onOpenApprovalModal: (approval: ApprovalItem) => void;
  approvals: ApprovalItem[];
  onOpenWorkspaceModal: () => void;
  error?: string | null;
  onClearError?: () => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  streamingText,
  isStreaming,
  onSendMessage,
  onStopGeneration,
  onRetryMessage,
  onContinueMessage,
  activeFilePath,
  activeWorkspace,
  hasSelectedCode,
  onOpenApprovalModal,
  approvals,
  onOpenWorkspaceModal,
  error,
  onClearError,
}) => {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<string>('chat');
  const [includeFileContext, setIncludeFileContext] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages or streaming tokens
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  // Adjust textarea height dynamically
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isStreaming) return;
    const text = input.trim();
    setInput('');
    onSendMessage(text, mode);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');

  return (
    <div className="flex-1 bg-navy-950 flex flex-col h-full overflow-hidden select-none">
      {/* Messages area or Welcome Screen */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && !streamingText ? (
          <WelcomeScreen
            activeWorkspace={activeWorkspace}
            activeFilePath={activeFilePath}
            onSelectAction={(prompt, actMode) => {
              setMode(actMode);
              onSendMessage(prompt, actMode);
            }}
            onOpenWorkspaceModal={onOpenWorkspaceModal}
          />
        ) : (
          <div className="max-w-4xl mx-auto space-y-5">
            {messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              const isLastAssistant = !isUser && index === messages.length - 1;

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col text-xs md:text-sm ${
                    isUser ? 'items-end' : 'items-start'
                  }`}
                >
                  {/* Sender label */}
                  <div className="flex items-center space-x-1.5 mb-1 px-1">
                    {isUser ? (
                      <>
                        <span className="text-[11px] font-medium text-slate-400">You</span>
                        <div className="w-4 h-4 rounded bg-slate-700 flex items-center justify-center">
                          <User className="w-2.5 h-2.5 text-slate-200" />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-4 h-4 rounded bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
                          <Bot className="w-2.5 h-2.5 text-white" />
                        </div>
                        <span className="text-[11px] font-medium text-blue-400">ForgeLocal</span>
                      </>
                    )}
                  </div>

                  {/* Message Bubble */}
                  <div
                    className={`rounded-xl px-4 py-3 leading-relaxed max-w-[92%] sm:max-w-[85%] ${
                      isUser
                        ? 'bg-blue-600 text-white rounded-tr-none shadow-sm selection:bg-navy-950 selection:text-white'
                        : 'bg-navy-900 border border-navy-700/80 text-slate-200 rounded-tl-none shadow-sm font-sans'
                    }`}
                  >
                    {isUser ? (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <MarkdownMessage content={msg.content} />
                    )}

                    {/* Inline Action proposal cards */}
                    {!isUser && msg.tool_calls && Array.isArray(msg.tool_calls) && (
                      <div className="mt-3 space-y-2 border-t border-navy-800 pt-2.5">
                        {msg.tool_calls.map((act: any, idx: number) => (
                          <div
                            key={idx}
                            className="bg-navy-950 p-3 rounded-lg border border-amber-500/40 flex items-center justify-between text-xs"
                          >
                            <div className="flex items-center space-x-2.5 truncate">
                              <div className="w-6 h-6 rounded bg-amber-500/10 flex items-center justify-center border border-amber-500/30 shrink-0">
                                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                              </div>
                              <div className="truncate">
                                <span className="font-semibold text-slate-200 uppercase text-[10px] block tracking-wide">
                                  Proposal: {act.action_type || act.action}
                                </span>
                                <span className="text-[11px] font-mono text-slate-400 truncate block">
                                  {act.target_path || act.path || (act.command_args ? act.command_args.join(' ') : '')}
                                </span>
                              </div>
                            </div>

                            <button
                              onClick={() => {
                                const found = approvals.find((a) => a.id === act.id);
                                if (found) onOpenApprovalModal(found);
                              }}
                              className="px-3 py-1 rounded-md bg-amber-600 hover:bg-amber-500 text-white font-medium text-[11px] transition shrink-0 ml-3 shadow-sm"
                            >
                              Review & Decide
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Message actions (Retry & Continue on last assistant response) */}
                  {isLastAssistant && !isStreaming && (
                    <div className="flex items-center space-x-2 mt-1.5 px-1">
                      {lastUserMsg && (
                        <button
                          onClick={() => onRetryMessage(lastUserMsg.content)}
                          className="flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] text-slate-400 hover:text-slate-200 hover:bg-navy-800 transition"
                          title="Regenerate model response"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Retry</span>
                        </button>
                      )}

                      <button
                        onClick={onContinueMessage}
                        className="flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] text-slate-400 hover:text-slate-200 hover:bg-navy-800 transition"
                        title="Ask model to continue generation"
                      >
                        <Play className="w-3 h-3" />
                        <span>Continue</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Live Streaming response bubble */}
            {isStreaming && (
              <div className="flex flex-col items-start text-xs md:text-sm">
                <div className="flex items-center space-x-1.5 mb-1 px-1">
                  <div className="w-4 h-4 rounded bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
                    <Bot className="w-2.5 h-2.5 text-white" />
                  </div>
                  <span className="text-[11px] font-medium text-blue-400">ForgeLocal</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping ml-1" />
                </div>

                <div className="rounded-xl px-4 py-3 leading-relaxed max-w-[92%] sm:max-w-[85%] bg-navy-900 border border-navy-700/80 text-slate-200 rounded-tl-none shadow-sm font-sans">
                  {streamingText ? (
                    <MarkdownMessage content={streamingText} />
                  ) : (
                    <div className="flex items-center space-x-2 text-slate-400 italic">
                      <RotateCcw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                      <span>Thinking locally with qwen2.5-coder:7b...</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mx-4 mb-2 p-2.5 rounded-lg bg-rose-950/60 border border-rose-700/80 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          {onClearError && (
            <button onClick={onClearError} className="p-1 hover:text-white">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Large Prompt Composer */}
      <div className="p-3 md:p-4 bg-navy-950 border-t border-navy-700/80 select-none">
        <div className="max-w-4xl mx-auto flex flex-col rounded-xl bg-navy-900 border border-navy-700/80 focus-within:border-blue-500/80 transition-all shadow-md">
          {/* Composer Context Pills & Mode selector */}
          <div className="px-3 pt-2 pb-1 flex items-center justify-between border-b border-navy-800 text-xs">
            <div className="flex items-center space-x-2 overflow-x-auto">
              {/* Mode selector */}
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="bg-navy-950 text-slate-300 border border-navy-700 rounded px-2 py-0.5 text-[11px] font-medium focus:outline-none"
              >
                <option value="chat">Mode: Chat</option>
                <option value="explain">Mode: Explain</option>
                <option value="refactor">Mode: Refactor</option>
                <option value="test">Mode: Unit Tests</option>
                <option value="fix">Mode: Bug Fix</option>
              </select>

              {/* Active file attachment chip */}
              {activeFilePath && (
                <div
                  className={`flex items-center space-x-1.5 px-2 py-0.5 rounded text-[11px] font-mono border transition ${
                    includeFileContext
                      ? 'bg-blue-950/60 border-blue-600/60 text-blue-300'
                      : 'bg-navy-950 border-navy-800 text-slate-500 line-through'
                  }`}
                  title={includeFileContext ? 'File attached to prompt context' : 'File detached'}
                >
                  <FileCode className="w-3 h-3 text-blue-400" />
                  <span className="truncate max-w-[120px]">{activeFilePath.split('/').pop()}</span>
                  <button
                    onClick={() => setIncludeFileContext(!includeFileContext)}
                    className="hover:text-white"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              )}
            </div>

            <span className="text-[10px] text-slate-400 hidden sm:inline">
              Shift+Enter for newline
            </span>
          </div>

          {/* Prompt textarea */}
          <div className="p-2.5 flex items-end space-x-2">
            <textarea
              ref={textareaRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask ForgeLocal, request a code edit, or type instructions..."
              disabled={isStreaming}
              className="flex-1 bg-transparent text-xs md:text-sm text-slate-100 placeholder-slate-400 focus:outline-none resize-none leading-relaxed px-1"
            />

            {/* Send / Stop Controls */}
            <div className="shrink-0 mb-0.5">
              {isStreaming ? (
                <button
                  type="button"
                  onClick={onStopGeneration}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium transition shadow-sm"
                  title="Stop generation"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>Stop</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSubmit()}
                  disabled={!input.trim()}
                  className="flex items-center justify-center p-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-30 disabled:cursor-not-allowed shadow-sm shadow-blue-500/20"
                  title="Send message (Enter)"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
