import React from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  FileCode,
  Terminal,
  Trash2,
  X,
  AlertTriangle,
} from 'lucide-react';
import { ApprovalItem } from '../types';
import { DiffViewer } from './DiffViewer';

interface ApprovalModalProps {
  approval: ApprovalItem | null;
  isOpen: boolean;
  onClose: () => void;
  onDecide: (id: string, decision: 'approve' | 'reject') => Promise<void>;
  resolving: boolean;
}

export const ApprovalModal: React.FC<ApprovalModalProps> = ({
  approval,
  isOpen,
  onClose,
  onDecide,
  resolving,
}) => {
  if (!isOpen || !approval) return null;

  const isPending = approval.status === 'pending';

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-editor-panel border border-editor-border rounded-lg shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden text-zinc-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-editor-border flex items-center justify-between bg-zinc-900/80">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-wide">
                Approval Required: {approval.action_type.replace('_', ' ').toUpperCase()}
              </h2>
              <p className="text-[11px] text-zinc-400">
                ForgeLocal never alters files or runs commands without your explicit review.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Reason Card */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded p-3 text-xs">
            <span className="text-zinc-400 font-semibold uppercase tracking-wider text-[10px] block mb-1">
              Model's Rationale:
            </span>
            <p className="text-zinc-200 leading-relaxed">{approval.reason}</p>
          </div>

          {/* Target File or Command info */}
          {approval.target_path && (
            <div className="flex items-center space-x-2 text-xs font-mono bg-zinc-950 p-2.5 rounded border border-zinc-800">
              <FileCode className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="text-zinc-400">Target File:</span>
              <span className="text-blue-300 font-semibold">{approval.target_path}</span>
            </div>
          )}

          {approval.command_args && (
            <div className="flex items-center space-x-2 text-xs font-mono bg-zinc-950 p-2.5 rounded border border-zinc-800">
              <Terminal className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-zinc-400">Command:</span>
              <span className="text-emerald-300 font-semibold">
                {approval.command_args.join(' ')}
              </span>
            </div>
          )}

          {/* Unified Diff View */}
          {approval.diff && (
            <div>
              <span className="text-[11px] font-semibold uppercase text-zinc-400 block mb-1.5">
                Proposed Changes:
              </span>
              <DiffViewer diffText={approval.diff} filename={approval.target_path || undefined} />
            </div>
          )}

          {/* Execution Result if already resolved */}
          {!isPending && approval.execution_result && (
            <div className="mt-3 bg-zinc-950 border border-zinc-800 rounded p-3 text-xs font-mono">
              <span className="text-zinc-400 font-semibold block mb-1 text-[10px] uppercase">
                Execution Result ({approval.status}):
              </span>
              <pre className="text-zinc-300 whitespace-pre-wrap">{approval.execution_result}</pre>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-editor-border bg-zinc-900/90 flex items-center justify-between">
          <div className="flex items-center space-x-1.5 text-xs text-zinc-400">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>Approve only if changes match your intended plan.</span>
          </div>

          <div className="flex items-center space-x-2">
            {isPending ? (
              <>
                <button
                  disabled={resolving}
                  onClick={() => onDecide(approval.id, 'reject')}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-zinc-800 hover:bg-rose-950/50 hover:text-rose-300 text-zinc-300 border border-zinc-700 text-xs font-medium transition disabled:opacity-50"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Reject</span>
                </button>

                <button
                  disabled={resolving}
                  onClick={() => onDecide(approval.id, 'approve')}
                  className="flex items-center space-x-1.5 px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition shadow-md disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{resolving ? 'Executing...' : 'Approve & Apply'}</span>
                </button>
              </>
            ) : (
              <button
                onClick={onClose}
                className="px-4 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
