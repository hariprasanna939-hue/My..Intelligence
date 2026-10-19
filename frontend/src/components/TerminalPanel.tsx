import React, { useState } from 'react';
import {
  Terminal as TerminalIcon,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  X,
} from 'lucide-react';
import { CommandResult } from '../types';

interface TerminalPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onRunCommand: (commandArgs: string[]) => Promise<void>;
  commandResult: CommandResult | null;
  isRunning: boolean;
}

export const TerminalPanel: React.FC<TerminalPanelProps> = ({
  isOpen,
  onClose,
  onRunCommand,
  commandResult,
  isRunning,
}) => {
  const [customCmd, setCustomCmd] = useState('');

  if (!isOpen) return null;

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customCmd.trim() && !isRunning) {
      const args = customCmd.trim().split(/\s+/);
      onRunCommand(args);
    }
  };

  return (
    <div className="h-64 bg-zinc-950 border-t border-editor-border flex flex-col shrink-0 select-none">
      {/* Top action header */}
      <div className="h-9 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-3">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 text-xs text-zinc-300 font-medium">
            <TerminalIcon className="w-3.5 h-3.5 text-blue-400" />
            <span>Terminal & Test Runner</span>
          </div>

          <div className="h-4 w-[1px] bg-zinc-800" />

          {/* Quick preset buttons */}
          <div className="flex items-center space-x-1.5">
            <button
              disabled={isRunning}
              onClick={() => onRunCommand(['pytest', '-v'])}
              className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-mono transition border border-zinc-700/60 disabled:opacity-50"
              title="Run pytest in active workspace"
            >
              pytest -v
            </button>

            <button
              disabled={isRunning}
              onClick={() => onRunCommand(['git', 'status'])}
              className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-mono transition border border-zinc-700/60 disabled:opacity-50"
            >
              git status
            </button>

            <button
              disabled={isRunning}
              onClick={() => onRunCommand(['git', 'diff'])}
              className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-mono transition border border-zinc-700/60 disabled:opacity-50"
            >
              git diff
            </button>
          </div>
        </div>

        {/* Command Status / Close */}
        <div className="flex items-center space-x-3">
          {commandResult && (
            <div className="flex items-center space-x-2 text-[11px] font-mono">
              <span className="text-zinc-500 flex items-center space-x-1">
                <Clock className="w-3 h-3" />
                <span>{commandResult.execution_time_ms}ms</span>
              </span>
              <span
                className={`flex items-center space-x-1 px-1.5 py-0.2 rounded text-[10px] ${
                  commandResult.return_code === 0
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : 'bg-rose-950 text-rose-400 border border-rose-800'
                }`}
              >
                {commandResult.return_code === 0 ? (
                  <CheckCircle2 className="w-2.5 h-2.5" />
                ) : (
                  <XCircle className="w-2.5 h-2.5" />
                )}
                <span>exit {commandResult.return_code}</span>
              </span>
            </div>
          )}

          <button
            onClick={onClose}
            className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Output Console */}
      <div className="flex-1 p-3 overflow-y-auto font-mono text-xs text-zinc-300 space-y-1">
        {isRunning ? (
          <div className="flex items-center space-x-2 text-zinc-400 italic">
            <RotateCcw className="w-3.5 h-3.5 animate-spin text-blue-400" />
            <span>Executing command in workspace...</span>
          </div>
        ) : commandResult ? (
          <div>
            <div className="text-zinc-500 text-[11px] mb-1">
              $ {commandResult.command}
            </div>
            {commandResult.stdout && (
              <pre className="whitespace-pre-wrap text-zinc-200">{commandResult.stdout}</pre>
            )}
            {commandResult.stderr && (
              <pre className="whitespace-pre-wrap text-rose-400 mt-1">{commandResult.stderr}</pre>
            )}
          </div>
        ) : (
          <div className="text-zinc-600 italic">
            Ready to run allowlisted commands (pytest, git, python, etc.).
          </div>
        )}
      </div>

      {/* Command prompt input */}
      <form onSubmit={handleCustomSubmit} className="h-8 bg-zinc-900/90 border-t border-zinc-800 flex items-center px-2">
        <span className="text-blue-400 font-mono text-xs font-bold mr-2 select-none">$</span>
        <input
          type="text"
          value={customCmd}
          onChange={(e) => setCustomCmd(e.target.value)}
          placeholder="Run command (e.g. pytest tests/test_calc.py)"
          disabled={isRunning}
          className="flex-1 bg-transparent text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none font-mono"
        />
        <button
          type="submit"
          disabled={isRunning || !customCmd.trim()}
          className="p-1 text-zinc-400 hover:text-blue-400 disabled:opacity-30 transition"
        >
          <Play className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
