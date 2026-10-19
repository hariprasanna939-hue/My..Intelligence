import React, { useState } from 'react';
import { FolderOpen, X, Check, ArrowRight } from 'lucide-react';

interface WorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentWorkspace: string | null;
  onSelectWorkspace: (path: string) => Promise<void>;
}

export const WorkspaceModal: React.FC<WorkspaceModalProps> = ({
  isOpen,
  onClose,
  currentWorkspace,
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

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-editor-panel border border-editor-border rounded-lg shadow-2xl max-w-md w-full overflow-hidden text-zinc-100 animate-in fade-in zoom-in-95 duration-150">
        <div className="px-5 py-3.5 border-b border-editor-border flex items-center justify-between bg-zinc-900/80">
          <div className="flex items-center space-x-2">
            <FolderOpen className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-semibold tracking-wide">Open Project Workspace</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div>
            <label className="block font-medium text-zinc-300 mb-1.5">
              Enter Absolute Project Directory Path:
            </label>
            <input
              type="text"
              value={path}
              onChange={(e) => {
                setPath(e.target.value);
                setError(null);
              }}
              placeholder="/Users/username/Projects/my-app"
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-zinc-100 font-mono text-xs focus:outline-none focus:border-blue-500"
              autoFocus
            />
            {error && <p className="text-rose-400 text-[11px] mt-1.5">{error}</p>}
          </div>

          {/* Quick preset suggestion */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded p-2.5">
            <span className="text-[10px] uppercase font-semibold text-zinc-500 block mb-1">
              Quick test workspace:
            </span>
            <button
              type="button"
              onClick={() => setPath('/Users/prasannahari/Projects/ForgeLocal/sample_workspace')}
              className="text-left font-mono text-[11px] text-blue-400 hover:underline break-all"
            >
              /Users/prasannahari/Projects/ForgeLocal/sample_workspace
            </button>
          </div>

          <div className="pt-2 border-t border-editor-border flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !path.trim()}
              className="flex items-center space-x-1 px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white transition text-xs font-medium shadow disabled:opacity-50"
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
