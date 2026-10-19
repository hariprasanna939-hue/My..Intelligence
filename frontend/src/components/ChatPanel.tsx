import React, { useEffect, useRef, useState } from 'react';
import {
  Send,
  Sparkles,
  ShieldAlert,
  Code2,
  Bug,
  TestTube,
  Wand2,
  MessageSquare,
  ChevronRight,
  Bot,
  User,
  RotateCcw,
} from 'lucide-react';
import { ApprovalItem, ChatMessage } from '../types';

interface ChatPanelProps {
  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
  onSendMessage: (content: string, mode: string) => Promise<void>;
  activeFilePath?: string;
  hasSelectedCode?: boolean;
  onOpenApprovalModal: (approval: ApprovalItem) => void;
  approvals: ApprovalItem[];
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  streamingText,
  isStreaming,
  onSendMessage,
  activeFilePath,
  hasSelectedCode,
  onOpenApprovalModal,
  approvals,
}) => {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'chat' | 'explain' | 'refactor' | 'test' | 'fix'>('chat');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll when messages or streaming tokens arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isStreaming) {
      const text = input.trim();
      setInput('');
      onSendMessage(text, mode);
    }
  };

  const handleQuickPrompt = (prompt: string, targetMode: typeof mode) => {
    if (isStreaming) return;
    setMode(targetMode);
    onSendMessage(prompt, targetMode);
  };

  return (
    <div className="w-80 md:w-96 bg-editor-panel border-l border-editor-border flex flex-col shrink-0 select-none">
      {/* Chat Header */}
      <div className="h-10 border-b border-editor-border bg-editor-header/80 px-3 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-semibold tracking-wide text-zinc-200">
            AI Pair Programmer
          </span>
        </div>

        {/* Mode selector dropdown */}
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as any)}
          className="bg-zinc-800 text-zinc-300 border border-zinc-700 rounded px-2 py-0.5 text-[11px] font-medium focus:outline-none"
        >
          <option value="chat">Chat</option>
          <option value="explain">Explain</option>
          <option value="refactor">Refactor</option>
          <option value="test">Unit Tests</option>
          <option value="fix">Fix Bug</option>
        </select>
      </div>

      {/* Quick context pills if file is focused */}
      {activeFilePath && (
        <div className="px-3 py-1.5 bg-zinc-900/60 border-b border-zinc-800 flex items-center space-x-1.5 overflow-x-auto text-[10px]">
          <span className="text-zinc-500 uppercase font-semibold">Shortcuts:</span>
          <button
            onClick={() => handleQuickPrompt(`Explain the structure and functionality of ${activeFilePath}`, 'explain')}
            className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 shrink-0 border border-zinc-700/60"
          >
            Explain File
          </button>
          <button
            onClick={() => handleQuickPrompt(`Write comprehensive unit tests for ${activeFilePath}`, 'test')}
            className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 shrink-0 border border-zinc-700/60"
          >
            Generate Tests
          </button>
          <button
            onClick={() => handleQuickPrompt(`Refactor ${activeFilePath} for clarity, performance, and best practices`, 'refactor')}
            className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 shrink-0 border border-zinc-700/60"
          >
            Refactor
          </button>
        </div>
      )}

      {/* Message List */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3.5">
        {messages.length === 0 && !streamingText && (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-zinc-500 space-y-2">
            <Bot className="w-8 h-8 text-zinc-600 mb-1" />
            <p className="text-xs font-medium text-zinc-400">Welcome to ForgeLocal</p>
            <p className="text-[11px] text-zinc-500 max-w-[240px]">
              Powered 100% offline by your local <code className="text-blue-400 font-mono">qwen2.5-coder:7b</code> model.
              Ask any question, edit files, or generate tests.
            </p>
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          // Find approvals tied to this message if any
          const msgApprovals = approvals.filter((a) => a.session_id === msg.session_id);

          return (
            <div
              key={msg.id}
              className={`flex flex-col text-xs ${isUser ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center space-x-1.5 mb-1 px-1">
                {isUser ? (
                  <>
                    <span className="text-[10px] text-zinc-500">You</span>
                    <User className="w-3 h-3 text-zinc-400" />
                  </>
                ) : (
                  <>
                    <Bot className="w-3 h-3 text-blue-400" />
                    <span className="text-[10px] text-zinc-400 font-medium">ForgeLocal</span>
                  </>
                )}
              </div>

              <div
                className={`p-3 rounded-lg leading-relaxed max-w-[95%] whitespace-pre-wrap ${
                  isUser
                    ? 'bg-blue-600 text-white rounded-br-none shadow-sm'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-bl-none font-sans'
                }`}
              >
                {msg.content}

                {/* Inline Action Cards for Approvals generated in this session */}
                {!isUser && msg.tool_calls && Array.isArray(msg.tool_calls) && (
                  <div className="mt-3 space-y-2 border-t border-zinc-800 pt-2">
                    {msg.tool_calls.map((act: any, idx: number) => (
                      <div
                        key={idx}
                        className="bg-zinc-950 p-2.5 rounded border border-amber-600/40 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center space-x-2 truncate">
                          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                          <div className="truncate">
                            <span className="font-semibold text-zinc-200 uppercase text-[10px] block">
                              Proposal: {act.action_type || act.action}
                            </span>
                            <span className="text-[11px] font-mono text-zinc-400 truncate block">
                              {act.target_path || act.path || (act.command_args ? act.command_args.join(' ') : '')}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            const found = approvals.find((a) => a.id === act.id);
                            if (found) onOpenApprovalModal(found);
                          }}
                          className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium text-[10px] transition shrink-0 ml-2"
                        >
                          Review & Decide
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Live Streaming response bubble */}
        {isStreaming && (
          <div className="flex flex-col items-start text-xs">
            <div className="flex items-center space-x-1.5 mb-1 px-1">
              <Bot className="w-3 h-3 text-blue-400" />
              <span className="text-[10px] text-zinc-400 font-medium">ForgeLocal</span>
              <RotateCcw className="w-2.5 h-2.5 animate-spin text-blue-400 ml-1" />
            </div>

            <div className="p-3 rounded-lg leading-relaxed max-w-[95%] whitespace-pre-wrap bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-bl-none font-sans">
              {streamingText || <span className="text-zinc-500 italic">Thinking locally...</span>}
            </div>
          </div>
        )}
      </div>

      {/* Input box */}
      <form onSubmit={handleSubmit} className="p-2.5 border-t border-editor-border bg-editor-header/90">
        <div className="relative flex items-center">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Ask ForgeLocal or type /explain, /refactor, /test..."
            rows={2}
            disabled={isStreaming}
            className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg p-2.5 pr-10 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 resize-none"
          />

          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="absolute right-2 p-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 transition shadow-sm"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
};
