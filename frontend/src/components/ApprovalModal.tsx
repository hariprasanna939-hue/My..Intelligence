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
    <div className="fixed inset-0 z-50 bg-[#1e1b4b]/40 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-white border border-slate-700/60 rounded-2xl shadow-[0_16px_40px_rgba(41,44,121,0.14)] max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden text-slate-800 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-700/40 flex items-center justify-between bg-[#f8f9fd]">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200 shrink-0">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-slate-800">
                Approval Required: {approval.action_type.replace('_', ' ').toUpperCase()}
              </h2>
              <p className="text-[11px] text-slate-400">
                My Intelligence never writes files or runs commands without your explicit review.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-200/60 text-slate-400 hover:text-slate-700 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Reason Card */}
          <div className="bg-[#f8f9fd] border border-slate-700/60 rounded-xl p-3.5 text-xs">
            <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px] block mb-1">
              Model's Rationale:
            </span>
            <p className="text-slate-800 leading-relaxed font-sans">{approval.reason}</p>
          </div>

          {/* Target File or Command info */}
          {approval.target_path && (
            <div className="flex items-center space-x-2 text-xs font-mono bg-[#f8f9fd] p-3 rounded-xl border border-slate-700/60">
              <FileCode className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="text-slate-400 font-medium">Target File:</span>
              <span className="text-blue-700 font-semibold">{approval.target_path}</span>
            </div>
          )}

          {approval.command_args && (
            <div className="flex items-center space-x-2 text-xs font-mono bg-[#f8f9fd] p-3 rounded-xl border border-slate-700/60">
              <Terminal className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="text-slate-400 font-medium">Command:</span>
              <span className="text-emerald-700 font-semibold">
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
            <div className="mt-3 bg-[#f8f9fd] border border-slate-700/60 rounded-xl p-3 text-xs font-mono">
              <span className="text-slate-500 font-semibold block mb-1 text-[10px] uppercase">
                Execution Result ({approval.status}):
              </span>
              <pre className="text-slate-800 whitespace-pre-wrap">{approval.execution_result}</pre>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-slate-700/40 bg-[#f8f9fd] flex items-center justify-between">
          <div className="flex items-center space-x-1.5 text-xs text-slate-500">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>Approve only if these changes match your intended plan.</span>
          </div>

          <div className="flex items-center space-x-2">
            {isPending ? (
              <>
                <button
                  disabled={resolving}
                  onClick={() => onDecide(approval.id, 'reject')}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-full hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-300 text-xs font-semibold transition disabled:opacity-50"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Reject</span>
                </button>

                <button
                  disabled={resolving}
                  onClick={() => onDecide(approval.id, 'approve')}
                  className="flex items-center space-x-1.5 px-5 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition shadow-[0_2px_8px_rgba(16,185,129,0.3)] disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{resolving ? 'Executing...' : 'Approve & Apply'}</span>
                </button>
              </>
            ) : (
              <button
                onClick={onClose}
                className="px-5 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
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
