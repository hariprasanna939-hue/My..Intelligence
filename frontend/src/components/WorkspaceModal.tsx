import React, { useState } from 'react';
import { FolderOpen, X, ArrowRight, Folder, Clock } from 'lucide-react';

interface WorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentWorkspace: string | null;
  recentWorkspaces: string[];
  onSelectWorkspace: (path: string) => Promise<void>;
}

export const WorkspaceModal: React.FC<WorkspaceModalProps> = ({
  isOpen,
  onClose,
  currentWorkspace,
  recentWorkspaces,
  onSelectWorkspace,
}) => {
  const [path, setPath] = useState(currentWorkspace || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!path.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await onSelectWorkspace(path.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to open workspace directory');
    } finally {
      setLoading(false);
    }
  };

  const handlePickRecent = async (pickedPath: string) => {
    setLoading(true);
    setError(null);
    try {
      await onSelectWorkspace(pickedPath);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to open workspace directory');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-navy-900 border border-navy-700/80 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden text-slate-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-navy-800 flex items-center justify-between bg-navy-950">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
              <FolderOpen className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-slate-100">
                Open Project Workspace
              </h2>
              <p className="text-[11px] text-slate-400">
                Select an absolute local path on your Mac.
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div>
            <label className="block font-medium text-slate-200 mb-1.5">
              Project Directory Path:
            </label>
            <input
              type="text"
              value={path}
              onChange={(e) => {
                setPath(e.target.value);
                setError(null);
              }}
              placeholder="/Users/username/Projects/my-app"
              className="w-full bg-navy-950 border border-navy-700 rounded-lg px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-blue-500/80"
              autoFocus
            />
            {error && <p className="text-rose-400 text-[11px] mt-1.5">{error}</p>}
          </div>

          {/* Recent projects list */}
          {recentWorkspaces.length > 0 && (
            <div>
              <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1.5 flex items-center space-x-1">
                <Clock className="w-3 h-3 text-slate-500" />
                <span>Recent Projects:</span>
              </span>
              <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                {recentWorkspaces.map((recPath) => (
                  <div
                    key={recPath}
                    onClick={() => handlePickRecent(recPath)}
                    className="flex items-center space-x-2 p-2 rounded-lg bg-navy-950/80 hover:bg-navy-800/80 border border-navy-800/80 hover:border-navy-700 text-slate-300 hover:text-blue-300 cursor-pointer transition text-xs"
                  >
                    <Folder className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span className="truncate font-mono text-[11px] flex-1">{recPath}</span>
                    <span className="text-[10px] text-slate-500 shrink-0">Open</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick preset suggestion */}
          <div className="bg-navy-950 border border-navy-800 rounded-lg p-2.5">
            <span className="text-[10px] uppercase font-semibold text-slate-500 block mb-1">
              Sample Workspace:
            </span>
            <button
              type="button"
              onClick={() => setPath('/Users/prasannahari/Projects/ForgeLocal/sample_workspace')}
              className="text-left font-mono text-[11px] text-blue-400 hover:underline break-all"
            >
              /Users/prasannahari/Projects/ForgeLocal/sample_workspace
            </button>
          </div>

          {/* Modal Footer */}
          <div className="pt-2 border-t border-navy-800 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-navy-800 hover:bg-navy-750 text-slate-300 transition text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !path.trim()}
              className="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition text-xs font-medium shadow-sm disabled:opacity-50"
            >
              <span>{loading ? 'Opening...' : 'Open Workspace'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
