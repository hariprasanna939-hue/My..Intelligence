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
  CheckCircle2,
  Undo2,
  Clock,
  Wrench,
  Paperclip,
  Plus,
} from 'lucide-react';
import { ApprovalItem, ChatMessage, DocumentMetadata, TaskPlan, ToolActivity } from '../types';
import { WelcomeScreen } from './WelcomeScreen';
import { MarkdownMessage } from './MarkdownMessage';
import { DocumentAttachmentBar } from './DocumentAttachmentBar';

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
  activePlan?: TaskPlan | null;
  toolActivities?: ToolActivity[];
  onRevertApproval?: (approvalId: string) => Promise<void>;
  inputDraft?: string;
  onChangeInputDraft?: (text: string) => void;

  // Document attachments
  documents?: DocumentMetadata[];
  onUploadDocument?: (file: File) => Promise<void>;
  onDeleteDocument?: (id: string) => Promise<void>;
  onSummarizeDocument?: (id: string, type: string) => Promise<void>;
  uploadingDocument?: boolean;
  uploadProgressText?: string;
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
  activePlan,
  toolActivities,
  onRevertApproval,
  inputDraft,
  onChangeInputDraft,
  documents = [],
  onUploadDocument,
  onDeleteDocument,
  onSummarizeDocument,
  uploadingDocument = false,
  uploadProgressText,
}) => {
  const [internalInput, setInternalInput] = useState('');
  const input = inputDraft !== undefined ? inputDraft : internalInput;
  const setInput = onChangeInputDraft || setInternalInput;

  const [mode, setMode] = useState<string>('chat');
  const [includeFileContext, setIncludeFileContext] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onUploadDocument) {
      onUploadDocument(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

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
    <div className="flex-1 bg-white/60 backdrop-blur-md flex flex-col h-full overflow-hidden select-none selection:bg-[#7066e0]/20">
      {/* Messages area or Welcome Screen */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scroll-smooth">
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
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Active Task Plan Card */}
            {activePlan && (
              <div className="bg-white/[0.02] border border-white/[0.08] rounded-2xl p-4 shadow-lg backdrop-blur-md text-xs transition-all hover:bg-white/[0.04]">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-6 h-6 rounded-md bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    </div>
                    <span className="font-medium text-zinc-200 text-sm">
                      {activePlan.task_description || 'Step-by-step Execution'}
                    </span>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                      activePlan.status === 'completed'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                    }`}
                  >
                    {activePlan.status === 'completed' ? 'Completed' : 'In Progress'}
                  </span>
                </div>
                <div className="space-y-2.5 pl-1.5">
                  {activePlan.steps.map((step, sIdx) => (
                    <div key={sIdx} className="flex items-start space-x-2.5 text-[13px] text-zinc-400 group">
                      <CheckCircle2
                        className={`w-4 h-4 mt-0.5 shrink-0 transition-colors ${
                          activePlan.status === 'completed' ? 'text-emerald-500/70' : 'text-zinc-600 group-hover:text-zinc-400'
                        }`}
                      />
                      <span className="leading-relaxed">{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              const isLastAssistant = !isUser && index === messages.length - 1;

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col text-[13.5px] md:text-sm ${
                    isUser ? 'items-end' : 'items-start'
                  }`}
                >
                  {/* Sender label */}
                  <div className="flex items-center space-x-2 mb-1.5 px-1.5 text-[11px]">
                    {isUser ? (
                      <>
                        <span className="font-semibold text-[#5c6096]">You</span>
                        <div className="w-5 h-5 rounded-full bg-[#e8edfc] flex items-center justify-center border border-[#9ea2ec]/40 shadow-sm">
                          <User className="w-3 h-3 text-[#7066e0]" />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-[#7066e0] to-[#8b7ff0] flex items-center justify-center shadow-md">
                          <Bot className="w-3 h-3 text-white" />
                        </div>
                        <span className="font-semibold text-[#1e1b4b]">My Intelligence Agent</span>
                      </>
                    )}
                  </div>

                  {/* Message Bubble */}
                  <div
                    className={`rounded-2xl px-5 py-3.5 leading-relaxed max-w-[92%] sm:max-w-[85%] ${
                      isUser
                        ? 'bg-gradient-to-tr from-[#7066e0] via-[#8174ee] to-[#998bf4] text-white rounded-tr-sm shadow-[0_4px_16px_rgba(112,102,224,0.25)] font-normal'
                        : 'bg-white border border-[#9ea2ec]/40 text-[#1e1b4b] rounded-tl-sm shadow-[0_4px_20px_rgba(112,102,224,0.06)]'
                    }`}
                  >
                    {isUser ? (
                      <p className="whitespace-pre-wrap font-sans text-[14.5px] leading-relaxed text-white">{msg.content}</p>
                    ) : (
                      <MarkdownMessage content={msg.content} />
                    )}

                    {/* Inline Action proposal cards */}
                    {!isUser && msg.tool_calls && Array.isArray(msg.tool_calls) && (
                      <div className="mt-4 space-y-2.5 border-t border-[#9ea2ec]/25 pt-4">
                        {msg.tool_calls.map((act: any, idx: number) => {
                          const found = approvals.find((a) => a.id === act.id);
                          const isExecuted = found?.status === 'executed';
                          const isReverted = found?.status === 'reverted';

                          return (
                            <div
                              key={idx}
                              className="bg-[#f5f7fe] p-3 rounded-xl border border-[#9ea2ec]/40 flex items-center justify-between text-xs backdrop-blur-sm hover:border-[#7066e0]/50 transition-colors"
                            >
                              <div className="flex items-center space-x-3 overflow-hidden">
                                <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20 shrink-0">
                                  <ShieldAlert className="w-4 h-4 text-amber-500" />
                                </div>
                                <div className="min-w-0">
                                  <span className="font-semibold text-[#1e1b4b] uppercase text-[10px] block tracking-wider mb-0.5">
                                    Proposal: {act.action_type || act.action}
                                  </span>
                                  <span className="text-[11px] font-mono text-[#5c6096] truncate block">
                                    {act.target_path || act.path || (act.command_args ? act.command_args.join(' ') : '')}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center space-x-2 ml-4 shrink-0">
                                {isExecuted ? (
                                  <>
                                    <span className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full font-medium tracking-wide">
                                      Applied
                                    </span>
                                    {onRevertApproval && (
                                      <button
                                        onClick={() => onRevertApproval(found.id)}
                                        className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-white hover:bg-slate-100 text-[#1e1b4b] text-[11px] font-medium transition-colors border border-[#9ea2ec]/40 shadow-sm"
                                        title="Revert this modification"
                                      >
                                        <Undo2 className="w-3.5 h-3.5 text-[#5c6096]" />
                                        <span>Revert</span>
                                      </button>
                                    )}
                                  </>
                                ) : isReverted ? (
                                  <span className="text-[10px] text-[#5c6096] bg-[#edf0fd] border border-[#9ea2ec]/30 px-2.5 py-1 rounded-full font-medium tracking-wide">
                                    Reverted
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => {
                                      if (found) onOpenApprovalModal(found);
                                    }}
                                    className="px-3.5 py-1.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white font-semibold text-[11px] transition-colors shadow-sm"
                                  >
                                    Review & Decide
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Message actions (Retry & Continue on last assistant response) */}
                  {isLastAssistant && !isStreaming && (
                    <div className="flex items-center space-x-2 mt-2 px-1.5 text-[11px] text-[#5c6096]">
                      {lastUserMsg && (
                        <button
                          onClick={() => onRetryMessage(lastUserMsg.content)}
                          className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full hover:bg-white/80 border border-transparent hover:border-[#9ea2ec]/30 transition text-[#5c6096] hover:text-[#1e1b4b]"
                          title="Regenerate model response"
                        >
                          <RotateCcw className="w-3 h-3 text-[#7066e0]" />
                          <span>Retry</span>
                        </button>
                      )}

                      <button
                        onClick={onContinueMessage}
                        className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full hover:bg-white/80 border border-transparent hover:border-[#9ea2ec]/30 transition text-[#5c6096] hover:text-[#1e1b4b]"
                        title="Ask model to continue generation"
                      >
                        <Play className="w-3 h-3 text-[#7066e0]" />
                        <span>Continue</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Live Streaming response bubble with Tool Activity indicators */}
            {isStreaming && (
              <div className="flex flex-col items-start text-[13.5px] md:text-sm">
                <div className="flex items-center space-x-2 mb-1.5 px-1.5">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-[#7066e0] to-[#8b7ff0] flex items-center justify-center shadow-md">
                    <Bot className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-[11px] font-semibold text-[#1e1b4b]">My Intelligence Agent</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#7066e0] animate-pulse ml-1.5 shadow-[0_0_6px_rgba(112,102,224,0.6)]" />
                </div>

                {/* Real-time Tool Activity Badges */}
                {toolActivities && toolActivities.length > 0 && (
                  <div className="space-y-2 mb-3 w-full max-w-[92%] sm:max-w-[85%]">
                    {toolActivities.map((act, actIdx) => (
                      <div
                        key={actIdx}
                        className="bg-white/90 border border-[#9ea2ec]/40 rounded-xl px-3.5 py-2 flex items-center justify-between text-xs backdrop-blur-sm shadow-sm"
                      >
                        <div className="flex items-center space-x-3 overflow-hidden">
                          {act.status === 'running' ? (
                            <RotateCcw className="w-3.5 h-3.5 text-[#7066e0] animate-spin shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          )}
                          <span className="font-mono text-[#7066e0] font-semibold text-[11px] tracking-wide">
                            {act.tool}
                          </span>
                          <span className="text-[11px] font-mono text-[#5c6096] truncate">
                            {act.args?.path || act.args?.query || act.args?.pattern || (act.args?.command_args ? act.args.command_args.join(' ') : '')}
                          </span>
                        </div>
                        <span className="text-[10px] text-[#797d9e] uppercase font-medium tracking-wider ml-3">Turn {act.iteration}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="rounded-2xl px-5 py-4 leading-relaxed max-w-[92%] sm:max-w-[85%] bg-white/95 border border-[#9ea2ec]/40 text-[#1e1b4b] rounded-tl-sm shadow-[0_4px_20px_rgba(112,102,224,0.08)]">
                  {streamingText ? (
                    <MarkdownMessage content={streamingText} />
                  ) : (
                    <div className="flex items-center space-x-2.5 text-[#5c6096] italic text-xs">
                      <Sparkles className="w-4 h-4 animate-pulse text-[#7066e0]" />
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
        <div className="mx-4 mb-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[13px] flex items-center justify-between backdrop-blur-sm shadow-lg">
          <div className="flex items-center space-x-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="font-light">{error}</span>
          </div>
          {onClearError && (
            <button onClick={onClearError} className="p-1 hover:text-white transition-colors rounded-md hover:bg-white/[0.05]">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Large Prompt Composer - Reference Luminous Theme */}
      <div className="px-4 pb-4 pt-2">
        <div className="max-w-4xl mx-auto flex flex-col rounded-3xl bg-white/95 border border-[#9ea2ec]/40 focus-within:border-[#7066e0] focus-within:ring-2 focus-within:ring-[#7066e0]/20 transition-all duration-300 shadow-[0_8px_30px_rgba(112,102,224,0.12)]">
          
          {/* Attached documents strip */}
          {documents && documents.length > 0 && (
            <div className="px-4 pt-3 pb-2 border-b border-[#9ea2ec]/30">
              <DocumentAttachmentBar
                documents={documents}
                onUploadFile={onUploadDocument || (async () => {})}
                onDeleteDocument={onDeleteDocument || (async () => {})}
                onSummarizeDocument={onSummarizeDocument}
                uploading={!!uploadingDocument}
                uploadProgressText={uploadProgressText}
              />
            </div>
          )}

          {/* Composer Context Pills & Mode selector */}
          <div className="px-4 pt-3 pb-1.5 flex items-center justify-between text-xs border-b border-[#9ea2ec]/20">
            <div className="flex items-center space-x-2.5 overflow-x-auto no-scrollbar">
              
              {/* Paperclip Document Upload Button */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
                accept=".pdf,.docx,.txt,.md,.csv,.json,.py,.js,.jsx,.ts,.tsx,.html,.css,.sql,.yaml,.yml,.xml,.toml"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingDocument || isStreaming}
                className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-[#f0effe] hover:bg-[#e4e2fd] text-[#7066e0] text-[11px] font-medium transition-colors disabled:opacity-40"
                title="Upload Document (PDF, Word, CSV, JSON, Code, Text)"
              >
                <Plus className="w-3.5 h-3.5 text-[#7066e0]" />
                <span>Attach</span>
              </button>

              {/* Mode selector */}
              <div className="relative group">
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                  className="appearance-none bg-[#f1f4fe] hover:bg-[#e8edfc] border border-[#9ea2ec]/30 text-[#1e1b4b] rounded-full pl-3 pr-8 py-1 text-[11px] font-medium focus:outline-none transition-colors cursor-pointer"
                >
                  <option value="chat">Chat</option>
                  <option value="explain">Explain</option>
                  <option value="refactor">Refactor</option>
                  <option value="test">Test</option>
                  <option value="fix">Fix Bug</option>
                </select>
                <CornerDownLeft className="w-3 h-3 absolute right-3 top-1/2 -translate-y-1/2 text-[#7066e0] pointer-events-none rotate-90" />
              </div>

              {/* Active file attachment chip */}
              {activeFilePath && (
                <div
                  className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-[11px] font-mono transition-colors ${
                    includeFileContext
                      ? 'bg-[#e8edfc] border border-[#9ea2ec]/40 text-[#7066e0] font-medium'
                      : 'bg-[#f1f4fe] border border-[#9ea2ec]/20 text-[#797d9e] line-through'
                  }`}
                  title={includeFileContext ? 'File attached to prompt context' : 'File detached'}
                >
                  <FileCode className="w-3 h-3 opacity-70" />
                  <span className="truncate max-w-[150px]">{activeFilePath.split('/').pop()}</span>
                  <button
                    onClick={() => setIncludeFileContext(!includeFileContext)}
                    className="hover:text-[#1e1b4b] ml-1 opacity-70 hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            <span className="text-[10px] text-[#5c6096] hidden sm:inline tracking-wide font-medium">
              ⇧ ⏎ to add a new line
            </span>
          </div>

          {/* Prompt textarea */}
          <div className="p-4 flex items-end space-x-3">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message My Intelligence..."
              disabled={isStreaming}
              className="flex-1 bg-transparent text-[14px] md:text-[15px] text-[#1e1b4b] placeholder-[#858ab2] focus:outline-none resize-none leading-relaxed px-1 font-normal min-h-[24px]"
            />

            {/* Send / Stop Controls */}
            <div className="shrink-0 mb-0.5">
              {isStreaming ? (
                <button
                  type="button"
                  onClick={onStopGeneration}
                  className="flex items-center justify-center w-9 h-9 rounded-full bg-rose-500 hover:bg-rose-600 text-white transition-colors shadow-sm"
                  title="Stop generation"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSubmit()}
                  disabled={!input.trim()}
                  className="flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-tr from-[#7066e0] to-[#8b7ff0] hover:from-[#5d52d9] hover:to-[#7c6ff2] text-white transition-all disabled:opacity-20 disabled:cursor-not-allowed shadow-[0_4px_14px_rgba(112,102,224,0.35)]"
                  title="Send message (Enter)"
                >
                  <Send className="w-4 h-4 ml-0.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};