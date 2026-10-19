import React, { useState } from 'react';
import {
  Terminal as TerminalIcon,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  X,
  Trash2,
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
    <div className="h-64 bg-[#121324] border-t border-slate-700/60 flex flex-col shrink-0 select-none">
      {/* Top action header */}
      <div className="h-9 bg-white border-b border-slate-700/60 flex items-center justify-between px-3">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 text-xs text-slate-800 font-semibold">
            <TerminalIcon className="w-3.5 h-3.5 text-blue-600" />
            <span>Terminal & Test Runner</span>
          </div>

          <div className="h-4 w-[1px] bg-slate-200" />

          {/* Quick preset buttons */}
          <div className="flex items-center space-x-1.5">
            <button
              disabled={isRunning}
              onClick={() => onRunCommand(['pytest', '-v'])}
              className="px-2.5 py-0.5 rounded-full bg-[#f8f9fd] hover:bg-slate-100 text-slate-700 text-[11px] font-mono transition border border-slate-700/60 disabled:opacity-50"
              title="Run pytest in active workspace"
            >
              pytest -v
            </button>

            <button
              disabled={isRunning}
              onClick={() => onRunCommand(['git', 'status'])}
              className="px-2.5 py-0.5 rounded-full bg-[#f8f9fd] hover:bg-slate-100 text-slate-700 text-[11px] font-mono transition border border-slate-700/60 disabled:opacity-50"
            >
              git status
            </button>

            <button
              disabled={isRunning}
              onClick={() => onRunCommand(['git', 'diff'])}
              className="px-2.5 py-0.5 rounded-full bg-[#f8f9fd] hover:bg-slate-100 text-slate-700 text-[11px] font-mono transition border border-slate-700/60 disabled:opacity-50"
            >
              git diff
            </button>
          </div>
        </div>

        {/* Command Status / Close */}
        <div className="flex items-center space-x-3">
          {commandResult && (
            <div className="flex items-center space-x-2 text-[11px] font-mono">
              <span className="text-slate-500 flex items-center space-x-1">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>{commandResult.execution_time_ms}ms</span>
              </span>
              <span
                className={`flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  commandResult.return_code === 0
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                    : 'bg-rose-50 text-rose-700 border border-rose-300'
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
            className="p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-800 transition"
            title="Close terminal"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Output Console (High contrast dark iris) */}
      <div className="flex-1 p-3 overflow-y-auto font-mono text-xs text-slate-200 space-y-1 bg-[#121324]">
        {isRunning ? (
          <div className="flex items-center space-x-2 text-slate-400 italic">
            <RotateCcw className="w-3.5 h-3.5 animate-spin text-blue-400" />
            <span>Executing command within workspace sandbox...</span>
          </div>
        ) : commandResult ? (
          <div>
            <div className="text-indigo-400 text-[11px] mb-1 font-semibold">
              $ {commandResult.command}
            </div>
            {commandResult.stdout && (
              <pre className="whitespace-pre-wrap text-emerald-300">{commandResult.stdout}</pre>
            )}
            {commandResult.stderr && (
              <pre className="whitespace-pre-wrap text-rose-400 mt-1">{commandResult.stderr}</pre>
            )}
          </div>
        ) : (
          <div className="text-slate-500 italic">
            Ready to run allowlisted commands (pytest, git, python3, npm). Commands are never run automatically.
          </div>
        )}
      </div>

      {/* Command prompt input */}
      <form onSubmit={handleCustomSubmit} className="h-9 bg-[#1a1c33] border-t border-slate-800 flex items-center px-3">
        <span className="text-blue-400 font-mono text-xs font-bold mr-2 select-none">$</span>
        <input
          type="text"
          value={customCmd}
          onChange={(e) => setCustomCmd(e.target.value)}
          placeholder="Run controlled command (e.g. pytest tests/test_calculator.py)"
          disabled={isRunning}
          className="flex-1 bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none font-mono"
        />
        <button
          type="submit"
          disabled={isRunning || !customCmd.trim()}
          className="p-1 text-slate-400 hover:text-blue-400 disabled:opacity-30 transition"
          title="Execute"
        >
          <Play className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
