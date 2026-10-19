import React from 'react';
import { MessageSquare, FolderOpen, Code2, Terminal } from 'lucide-react';

export type MobileWorkspaceView = 'chat' | 'files' | 'editor' | 'terminal';

interface MobileWorkspaceNavigationProps {
  activeView: MobileWorkspaceView;
  onChangeView: (view: MobileWorkspaceView) => void;
  hasDirtyFiles?: boolean;
  isRunningCommand?: boolean;
  pendingApprovalsCount?: number;
}

export const MobileWorkspaceNavigation: React.FC<MobileWorkspaceNavigationProps> = ({
  activeView,
  onChangeView,
  hasDirtyFiles = false,
  isRunningCommand = false,
  pendingApprovalsCount = 0,
}) => {
  return (
    <nav
      aria-label="Mobile workspace view tabs"
      className="md:hidden bg-navy-950 border-t border-navy-800 flex items-center justify-around px-2 py-1 select-none shrink-0 z-20 pb-[env(safe-area-inset-bottom)]"
    >
      {/* Chat / Agent Tab */}
      <button
        type="button"
        onClick={() => onChangeView('chat')}
        className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-lg text-[10px] font-medium transition ${
          activeView === 'chat'
            ? 'text-blue-400 bg-navy-900/80 font-semibold'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <div className="relative">
          <MessageSquare className="w-4 h-4 mb-0.5" />
          {pendingApprovalsCount > 0 && (
            <span className="absolute -top-1 -right-1.5 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-navy-950" />
          )}
        </div>
        <span>Agent</span>
      </button>

      {/* Files Tab */}
      <button
        type="button"
        onClick={() => onChangeView('files')}
        className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-lg text-[10px] font-medium transition ${
          activeView === 'files'
            ? 'text-blue-400 bg-navy-900/80 font-semibold'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <FolderOpen className="w-4 h-4 mb-0.5" />
        <span>Files</span>
      </button>

      {/* Editor Tab */}
      <button
        type="button"
        onClick={() => onChangeView('editor')}
        className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-lg text-[10px] font-medium transition ${
          activeView === 'editor'
            ? 'text-blue-400 bg-navy-900/80 font-semibold'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <div className="relative">
          <Code2 className="w-4 h-4 mb-0.5" />
          {hasDirtyFiles && (
            <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-navy-950" />
          )}
        </div>
        <span>Editor</span>
      </button>

      {/* Terminal / Output Tab */}
      <button
        type="button"
        onClick={() => onChangeView('terminal')}
        className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-lg text-[10px] font-medium transition ${
          activeView === 'terminal'
            ? 'text-blue-400 bg-navy-900/80 font-semibold'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <div className="relative">
          <Terminal className="w-4 h-4 mb-0.5" />
          {isRunningCommand && (
            <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-blue-400 animate-ping ring-2 ring-navy-950" />
          )}
        </div>
        <span>Output</span>
      </button>
    </nav>
  );
};
