import React, { useRef } from 'react';
import { MessageCircle, PanelsTopLeft } from 'lucide-react';
import { AppWorkingMode } from '../types';

interface ModeSwitcherProps {
  mode: AppWorkingMode;
  onChangeMode: (mode: AppWorkingMode) => void;
  disabled?: boolean;
  compact?: boolean;
}

export const ModeSwitcher: React.FC<ModeSwitcherProps> = ({
  mode,
  onChangeMode,
  disabled = false,
  compact = false,
}) => {
  const chatRef = useRef<HTMLButtonElement>(null);
  const agentRef = useRef<HTMLButtonElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const nextMode: AppWorkingMode = mode === 'chat' ? 'agent' : 'chat';
      onChangeMode(nextMode);
      if (nextMode === 'chat') {
        chatRef.current?.focus();
      } else {
        agentRef.current?.focus();
      }
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Application Working Mode"
      onKeyDown={handleKeyDown}
      className={`relative inline-flex items-center bg-white/95 border border-[#9ea2ec]/40 rounded-full p-1 select-none transition-all shadow-[0_2px_8px_rgba(112,102,224,0.08)] ${
        disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
      }`}
    >
      {/* Smooth Sliding Pill Indicator with vibrant Periwinkle-Violet gradient matching reference */}
      <div
        className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full bg-gradient-to-r from-[#7066e0] via-[#8377ec] to-[#8b7ff0] transition-all duration-300 ease-out shadow-[0_2px_10px_rgba(112,102,224,0.35)] ${
          mode === 'chat' ? 'left-1' : 'left-[calc(50%+2px)]'
        }`}
        aria-hidden="true"
      />

      {/* Chat Mode Option */}
      <button
        ref={chatRef}
        type="button"
        role="radio"
        aria-checked={mode === 'chat'}
        tabIndex={mode === 'chat' ? 0 : -1}
        onClick={() => onChangeMode('chat')}
        className={`relative z-10 flex items-center justify-center space-x-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[#7066e0] focus-visible:ring-offset-1 focus-visible:ring-offset-white ${
          mode === 'chat'
            ? 'text-white font-semibold'
            : 'text-[#5c6096] hover:text-[#1e1b4b]'
        }`}
        title="Chat Mode: Clean conversational AI assistant without workspace modifications or file edits"
      >
        <MessageCircle className="w-3.5 h-3.5 shrink-0" />
        <span className={compact ? 'hidden sm:inline' : 'inline'}>Chat Mode</span>
      </button>

      {/* Agent Mode Option */}
      <button
        ref={agentRef}
        type="button"
        role="radio"
        aria-checked={mode === 'agent'}
        tabIndex={mode === 'agent' ? 0 : -1}
        onClick={() => onChangeMode('agent')}
        className={`relative z-10 flex items-center justify-center space-x-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[#7066e0] focus-visible:ring-offset-1 focus-visible:ring-offset-white ${
          mode === 'agent'
            ? 'text-white font-semibold'
            : 'text-[#5c6096] hover:text-[#1e1b4b]'
        }`}
        title="Agent Mode: Full coding workspace with file tree, code editor, diff approvals, and test runner"
      >
        <PanelsTopLeft className="w-3.5 h-3.5 shrink-0" />
        <span className={compact ? 'hidden sm:inline' : 'inline'}>Agent Mode</span>
      </button>
    </div>
  );
};
