import React, { useEffect, useRef, useState } from 'react';
import {
  Send,
  Square,
  Bot,
  User,
  RotateCcw,
  Copy,
  Check,
  AlertCircle,
  X,
  Play,
  Cpu,
  MessageSquare,
  Plus,
  Trash2,
  PanelLeftClose,
  PanelLeft,
  Sparkles,
  Paperclip,
} from 'lucide-react';
import { ChatMessage, ChatSession, DocumentMetadata, HealthResponse } from '../types';
import { ChatWelcomeScreen } from './ChatWelcomeScreen';
import { MarkdownMessage } from './MarkdownMessage';
import { DocumentAttachmentBar } from './DocumentAttachmentBar';

interface ChatModeLayoutProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
  onSendMessage: (content: string, mode: string) => Promise<void>;
  onStopGeneration: () => void;
  onRetryMessage: (lastUserMessage: string) => void;
  onContinueMessage: () => void;
  inputDraft: string;
  onChangeInputDraft: (text: string) => void;
  health: HealthResponse | null;
  error?: string | null;
  onClearError?: () => void;

  // Document attachments
  documents?: DocumentMetadata[];
  onUploadDocument?: (file: File) => Promise<void>;
  onDeleteDocument?: (id: string) => Promise<void>;
  onSummarizeDocument?: (id: string, type: string) => Promise<void>;
  uploadingDocument?: boolean;
  uploadProgressText?: string;
}

export const ChatModeLayout: React.FC<ChatModeLayoutProps> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  messages,
  streamingText,
  isStreaming,
  onSendMessage,
  onStopGeneration,
  onRetryMessage,
  onContinueMessage,
  inputDraft,
  onChangeInputDraft,
  health,
  error,
  onClearError,
  documents = [],
  onUploadDocument,
  onDeleteDocument,
  onSummarizeDocument,
  uploadingDocument = false,
  uploadProgressText,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
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

  // Dynamic textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [inputDraft]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputDraft.trim() || isStreaming) return;
    const text = inputDraft.trim();
    onChangeInputDraft('');
    onSendMessage(text, 'chat');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleCopyMessage = async (msgId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMsgId(msgId);
      setTimeout(() => setCopiedMsgId(null), 2000);
    } catch (err) {
      console.error('Failed to copy message:', err);
    }
  };

  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
  const activeModel = health?.active_model || 'qwen2.5-coder:7b';
  const isOllamaConnected = health?.ollama_connected ?? true;

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-reference-gradient relative selection:bg-[#7066e0]/20">
      {/* Background Decorative Ethereal Spheres matching Reference Visual Art */}
      <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full reference-bg-orb-2 blur-3xl pointer-events-none opacity-70" />
      <div className="absolute top-1/4 -right-24 w-96 h-96 rounded-full reference-bg-orb-1 blur-3xl pointer-events-none opacity-60" />
      <div className="absolute -bottom-24 left-1/3 w-80 h-80 rounded-full reference-bg-orb-2 blur-3xl pointer-events-none opacity-50" />

      {/* Collapsible Chat History Drawer for Chat Mode */}
      {sidebarOpen && (
        <aside className="w-64 bg-white/90 backdrop-blur-xl border-r border-[#9ea2ec]/40 flex flex-col shrink-0 z-30 transition-all duration-300 shadow-[0_12px_36px_rgba(112,102,224,0.12)]">
          <div className="p-3 border-b border-[#9ea2ec]/30 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#5c6096]">
              Conversations
            </span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1 rounded-full hover:bg-[#edf0fd] text-[#5c6096] hover:text-[#1e1b4b] transition"
              title="Close history"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          <div className="p-2.5">
            <button
              onClick={onNewSession}
              className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-full bg-gradient-to-r from-[#7066e0] to-[#8b7ff0] hover:from-[#5d52d9] hover:to-[#7c6ff2] text-white text-xs font-semibold transition shadow-[0_4px_14px_rgba(112,102,224,0.35)]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Chat</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {sessions.map((sess) => (
              <div
                key={sess.id}
                onClick={() => onSelectSession(sess.id)}
                className={`group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition ${
                  activeSessionId === sess.id
                    ? 'bg-[#e8edfc] text-[#7066e0] font-semibold border border-[#9ea2ec]/40'
                    : 'text-[#5c6096] hover:bg-[#f1f4fe] hover:text-[#1e1b4b]'
                }`}
              >
                <div className="flex items-center space-x-2 truncate">
                  <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-70" />
                  <span className="truncate">{sess.title}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(sess.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-500 transition"
                  title="Delete conversation"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </aside>
      )}

      {/* Main Conversation Container */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative z-10">
        {/* Top Floating Mini-Bar: History Toggle & New Chat Shortcut */}
        <div className="h-10 px-4 flex items-center justify-between border-b border-[#9ea2ec]/30 bg-white/40 backdrop-blur-md shrink-0">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs text-[#5c6096] hover:text-[#1e1b4b] hover:bg-white/80 transition border border-[#9ea2ec]/40 shadow-sm"
              title={sidebarOpen ? "Hide chat history" : "Show chat history"}
            >
              {sidebarOpen ? <PanelLeftClose className="w-3.5 h-3.5 text-[#7066e0]" /> : <PanelLeft className="w-3.5 h-3.5 text-[#7066e0]" />}
              <span className="text-[11px] font-medium hidden sm:inline">History</span>
            </button>

            <button
              onClick={onNewSession}
              className="flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs text-[#5c6096] hover:text-[#1e1b4b] hover:bg-white/80 transition border border-[#9ea2ec]/40 shadow-sm"
              title="Start a new chat"
            >
              <Plus className="w-3.5 h-3.5 text-[#7066e0]" />
              <span className="text-[11px] font-medium hidden sm:inline">New Chat</span>
            </button>
          </div>

          {/* Model Status Pill */}
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-white/80 border border-[#9ea2ec]/40 text-[11px] font-mono text-[#5c6096] shadow-sm">
            <span className="text-[#797d9e] hidden md:inline">Model:</span>
            <span className="text-[#1e1b4b] font-semibold">{activeModel}</span>
            <span className={`w-1.5 h-1.5 rounded-full ${isOllamaConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
          </div>
        </div>

        {/* Messages Scroll Area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
          {messages.length === 0 && !streamingText ? (
            <ChatWelcomeScreen
              onSelectPrompt={(prompt) => {
                onChangeInputDraft(prompt);
                textareaRef.current?.focus();
              }}
              health={health}
            />
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  {/* Sender Label */}
                  <div className="flex items-center space-x-2 text-[11px] mb-1.5 px-1.5">
                    {msg.role === 'user' ? (
                      <>
                        <span className="font-semibold text-[#5c6096]">You</span>
                        <div className="w-5 h-5 rounded-full bg-[#e8edfc] border border-[#9ea2ec]/40 flex items-center justify-center shadow-sm">
                          <User className="w-3 h-3 text-[#7066e0]" />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-[#7066e0] to-[#8b7ff0] flex items-center justify-center shadow-md">
                          <Bot className="w-3 h-3 text-white" />
                        </div>
                        <span className="font-semibold text-[#1e1b4b]">My Intelligence</span>
                        <span className="text-[#9ea2ec] text-[10px]">•</span>
                        <span className="text-[10px] text-[#5c6096] font-mono">Qwen2.5-Coder</span>
                      </>
                    )}
                  </div>

                  {/* Message Bubble */}
                  <div
                    className={`rounded-2xl px-5 py-3.5 leading-relaxed max-w-[92%] sm:max-w-[85%] ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-tr from-[#7066e0] via-[#8174ee] to-[#998bf4] text-white rounded-tr-sm shadow-[0_4px_16px_rgba(112,102,224,0.25)] font-normal'
                        : 'bg-white/95 border border-[#9ea2ec]/40 rounded-tl-sm text-[#1e1b4b] shadow-[0_4px_20px_rgba(112,102,224,0.06)]'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <div className="whitespace-pre-wrap font-sans text-[14.5px] leading-relaxed text-white">
                        {msg.content}
                      </div>
                    ) : (
                      <MarkdownMessage content={msg.content} />
                    )}
                  </div>

                  {/* Actions for Assistant messages */}
                  {msg.role === 'assistant' && (
                    <div className="flex items-center space-x-1.5 mt-2 px-1 text-[11px] text-[#5c6096]">
                      <button
                        onClick={() => handleCopyMessage(msg.id, msg.content)}
                        className="flex items-center space-x-1 hover:text-[#1e1b4b] transition py-1 px-2.5 rounded-full hover:bg-white/80 border border-transparent hover:border-[#9ea2ec]/30 shadow-none hover:shadow-sm"
                        title="Copy entire response"
                      >
                        {copiedMsgId === msg.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-600 font-medium">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 text-[#7066e0]" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>

                      {lastUserMsg && (
                        <button
                          onClick={() => onRetryMessage(lastUserMsg.content)}
                          disabled={isStreaming}
                          className="flex items-center space-x-1 hover:text-[#1e1b4b] transition disabled:opacity-40 py-1 px-2.5 rounded-full hover:bg-white/80 border border-transparent hover:border-[#9ea2ec]/30 shadow-none hover:shadow-sm"
                          title="Retry generation"
                        >
                          <RotateCcw className="w-3 h-3 text-[#7066e0]" />
                          <span>Retry</span>
                        </button>
                      )}

                      <button
                        onClick={onContinueMessage}
                        disabled={isStreaming}
                        className="flex items-center space-x-1 hover:text-[#1e1b4b] transition disabled:opacity-40 py-1 px-2.5 rounded-full hover:bg-white/80 border border-transparent hover:border-[#9ea2ec]/30 shadow-none hover:shadow-sm"
                        title="Ask the model to continue"
                      >
                        <Play className="w-3 h-3 text-[#7066e0]" />
                        <span>Continue</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {/* Streaming token display */}
              {isStreaming && (
                <div className="flex flex-col items-start">
                  <div className="flex items-center space-x-2 text-[11px] mb-1.5 px-1.5">
                    <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-[#7066e0] to-[#8b7ff0] flex items-center justify-center shadow-md">
                      <Bot className="w-3 h-3 text-white" />
                    </div>
                    <span className="font-semibold text-[#1e1b4b]">My Intelligence</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#7066e0] animate-pulse ml-1 shadow-[0_0_6px_rgba(112,102,224,0.6)]" />
                  </div>

                  <div className="rounded-2xl px-5 py-4 leading-relaxed max-w-[92%] sm:max-w-[85%] bg-white/95 border border-[#9ea2ec]/40 rounded-tl-sm text-[#1e1b4b] shadow-[0_4px_20px_rgba(112,102,224,0.08)] font-sans">
                    {streamingText ? (
                      <MarkdownMessage content={streamingText} />
                    ) : (
                      <div className="flex items-center space-x-2.5 text-[#5c6096] italic text-xs">
                        <RotateCcw className="w-3.5 h-3.5 animate-spin text-[#7066e0]" />
                        <span>Thinking locally with {activeModel}...</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Error Notification Banner */}
        {error && (
          <div className="max-w-3xl mx-auto w-full px-4 mb-2">
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between shadow-sm">
              <div className="flex items-center space-x-2.5">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>{error}</span>
              </div>
              {onClearError && (
                <button onClick={onClearError} className="p-1 hover:text-rose-900 transition">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Centered Bottom Composer inspired directly by Visual Reference Pill Bar */}
        <div className="p-3 sm:p-5 bg-gradient-to-t from-[#eaeffd]/80 via-[#eaeffd]/40 to-transparent shrink-0">
          <div className="max-w-3xl mx-auto flex flex-col">
            {/* Attached documents strip */}
            {documents && documents.length > 0 && (
              <DocumentAttachmentBar
                documents={documents}
                onUploadFile={onUploadDocument || (async () => {})}
                onDeleteDocument={onDeleteDocument || (async () => {})}
                onSummarizeDocument={onSummarizeDocument}
                uploading={!!uploadingDocument}
                uploadProgressText={uploadProgressText}
                className="mb-2 px-1"
              />
            )}

            <div className="flex items-center rounded-full bg-white border border-[#9ea2ec]/50 p-1.5 pl-2 sm:pl-3 shadow-[0_8px_24px_rgba(112,102,224,0.12)] focus-within:border-[#7066e0] focus-within:ring-2 focus-within:ring-[#7066e0]/25 transition-all">
              {/* Upload Document / Attachment button (+) inspired by Reference Left Pill Button */}
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
                className="w-8 h-8 rounded-full bg-[#f0effe] hover:bg-[#e4e2fd] text-[#7066e0] flex items-center justify-center shrink-0 mr-1.5 transition-transform active:scale-95 disabled:opacity-40 shadow-sm"
                title="Upload Document or Attachment (+)"
              >
                <Plus className="w-4 h-4" />
              </button>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                rows={1}
                value={inputDraft}
                onChange={(e) => onChangeInputDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={documents && documents.length > 0 ? "Ask a question about the uploaded document, or request a summary..." : "Ask me anything..."}
                disabled={isStreaming}
                className="flex-1 bg-transparent text-[14.5px] text-[#1e1b4b] placeholder-[#858ab2] focus:outline-none resize-none leading-relaxed py-1.5 px-1 max-h-36"
              />

              {/* Send / Stop Circular Action Button (Matching reference right circular purple button) */}
              <div className="shrink-0 ml-2">
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={onStopGeneration}
                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center shadow-[0_4px_12px_rgba(244,63,94,0.35)] transition-transform active:scale-95"
                    title="Stop generation"
                  >
                    <Square className="w-4 h-4 fill-current" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSubmit()}
                    disabled={!inputDraft.trim()}
                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-tr from-[#7066e0] to-[#8b7ff0] hover:from-[#5d52d9] hover:to-[#7c6ff2] text-white flex items-center justify-center shadow-[0_4px_14px_rgba(112,102,224,0.4)] transition-transform active:scale-95 disabled:opacity-35 disabled:cursor-not-allowed"
                    title="Send message (Enter)"
                  >
                    <Send className="w-4 h-4 ml-0.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Offline Privacy Guarantee Microcopy */}
            <div className="flex items-center justify-between text-[11px] text-[#5c6096] mt-2.5 px-3">
              <span className="flex items-center space-x-1.5">
                <Cpu className="w-3.5 h-3.5 text-[#7066e0]" />
                <span>Running locally · Qwen2.5-Coder · Offline Document Extraction · Zero cloud telemetry</span>
              </span>
              <span className="hidden sm:inline font-medium">
                Shift + Enter for new line
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
