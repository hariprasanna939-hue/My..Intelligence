import React from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  FileCode,
  Terminal,
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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-navy-900 border border-navy-700/80 rounded-xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden text-slate-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-navy-800 flex items-center justify-between bg-navy-950">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/30 shrink-0">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-slate-100">
                Approval Required: {approval.action_type.replace('_', ' ').toUpperCase()}
              </h2>
              <p className="text-[11px] text-slate-400">
                ForgeLocal never writes files or runs commands without your explicit review.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-navy-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Reason Card */}
          <div className="bg-navy-950 border border-navy-800 rounded-lg p-3.5 text-xs">
            <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px] block mb-1">
              Model's Rationale:
            </span>
            <p className="text-slate-200 leading-relaxed font-sans">{approval.reason}</p>
          </div>

          {/* Target File or Command info */}
          {approval.target_path && (
            <div className="flex items-center space-x-2 text-xs font-mono bg-navy-950 p-3 rounded-lg border border-navy-800">
              <FileCode className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="text-slate-400">Target File:</span>
              <span className="text-blue-300 font-semibold">{approval.target_path}</span>
            </div>
          )}

          {approval.command_args && (
            <div className="flex items-center space-x-2 text-xs font-mono bg-navy-950 p-3 rounded-lg border border-navy-800">
              <Terminal className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-slate-400">Command:</span>
              <span className="text-emerald-300 font-semibold">
                {approval.command_args.join(' ')}
              </span>
            </div>
          )}

          {/* Unified Diff View */}
          {approval.diff && (
            <div>
              <span className="text-[11px] font-semibold uppercase text-slate-400 block mb-1.5">
                Proposed Changes (Unified Diff):
              </span>
              <DiffViewer diffText={approval.diff} filename={approval.target_path || undefined} />
            </div>
          )}

          {/* Execution Result if already resolved */}
          {!isPending && approval.execution_result && (
            <div className="mt-3 bg-navy-950 border border-navy-800 rounded-lg p-3 text-xs font-mono">
              <span className="text-slate-400 font-semibold block mb-1 text-[10px] uppercase">
                Execution Result ({approval.status}):
              </span>
              <pre className="text-slate-300 whitespace-pre-wrap">{approval.execution_result}</pre>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-navy-800 bg-navy-950 flex items-center justify-between">
          <div className="flex items-center space-x-1.5 text-xs text-slate-400">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Approve only if these changes match your intended plan.</span>
          </div>

          <div className="flex items-center space-x-2">
            {isPending ? (
              <>
                <button
                  disabled={resolving}
                  onClick={() => onDecide(approval.id, 'reject')}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-navy-800 hover:bg-rose-950/60 hover:text-rose-300 text-slate-300 border border-navy-700 text-xs font-medium transition disabled:opacity-50"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Reject</span>
                </button>

                <button
                  disabled={resolving}
                  onClick={() => onDecide(approval.id, 'approve')}
                  className="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition shadow-sm disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{resolving ? 'Executing...' : 'Approve & Apply'}</span>
                </button>
              </>
            ) : (
              <button
                onClick={onClose}
                className="px-4 py-1.5 rounded-lg bg-navy-800 hover:bg-navy-750 text-slate-200 text-xs font-medium transition"
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
