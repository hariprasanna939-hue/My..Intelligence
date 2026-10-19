import React, { useState, useEffect } from 'react';
import { FolderOpen, X, ArrowRight, Folder, Clock, ChevronUp, HardDrive, Compass } from 'lucide-react';
import { api } from '../services/api';
import { BrowseDirectoryResponse } from '../types';

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

  // Folder browser state
  const [showBrowser, setShowBrowser] = useState(false);
  const [browserData, setBrowserData] = useState<BrowseDirectoryResponse | null>(null);
  const [browserLoading, setBrowserLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPath(currentWorkspace || '');
      setError(null);
    }
  }, [isOpen, currentWorkspace]);

  const loadBrowsePath = async (targetPath?: string) => {
    setBrowserLoading(true);
    try {
      const data = await api.browseDirectory(targetPath);
      setBrowserData(data);
    } catch (err: any) {
      setError(err.message || 'Could not browse directory');
    } finally {
      setBrowserLoading(false);
    }
  };

  const toggleBrowser = () => {
    if (!showBrowser) {
      setShowBrowser(true);
      loadBrowsePath(path || undefined);
    } else {
      setShowBrowser(false);
    }
  };

  const handleNativeFolderPicker = async () => {
    try {
      if ('showDirectoryPicker' in window) {
        // @ts-ignore
        const handle = await window.showDirectoryPicker();
        if (handle && handle.name) {
          // In standard web browsers, absolute filesystem paths are masked for sandboxing.
          // We inform the user and open the folder browser rooted at that name or user home.
          loadBrowsePath();
          setShowBrowser(true);
        }
      } else {
        alert('Native folder picker is not supported by your browser. Use the built-in Folder Browser below.');
        setShowBrowser(true);
        loadBrowsePath();
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setShowBrowser(true);
        loadBrowsePath();
      }
    }
  };

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
    <div className="fixed inset-0 z-50 bg-[#1e1b4b]/40 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-white border border-slate-700/60 rounded-2xl shadow-[0_16px_40px_rgba(41,44,121,0.14)] max-w-lg w-full overflow-hidden text-slate-800 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-700/40 flex items-center justify-between bg-[#f8f9fd]">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-200">
              <FolderOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-slate-800">
                Open Project Workspace
              </h2>
              <p className="text-[11px] text-slate-400">
                Select an absolute local path on your Mac.
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-medium text-slate-700">
                Project Directory Path:
              </label>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleNativeFolderPicker}
                  className="text-[11px] text-blue-600 hover:text-blue-700 font-medium transition flex items-center space-x-1"
                >
                  <HardDrive className="w-3 h-3" />
                  <span>Native Picker</span>
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={toggleBrowser}
                  className="text-[11px] text-blue-600 hover:text-blue-700 font-medium transition flex items-center space-x-1"
                >
                  <Compass className="w-3 h-3" />
                  <span>{showBrowser ? 'Hide Browser' : 'Browse Folders'}</span>
                </button>
              </div>
            </div>

            <input
              type="text"
              value={path}
              onChange={(e) => {
                setPath(e.target.value);
                setError(null);
              }}
              placeholder="/Users/username/Projects/my-app"
              className="w-full bg-[#f8f9fd] border border-slate-700/60 rounded-xl px-3 py-2 text-slate-800 font-mono text-xs focus:outline-none focus:border-blue-500"
              autoFocus
            />
            {error && <p className="text-rose-600 text-[11px] mt-1.5 font-medium">{error}</p>}
          </div>

          {/* Secure Backend Folder Browser */}
          {showBrowser && (
            <div className="bg-[#f8f9fd] border border-slate-700/60 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-semibold text-slate-500 font-mono truncate max-w-[280px]">
                  {browserData?.current_path || 'Browsing local folders...'}
                </span>
                {browserData?.parent_path && (
                  <button
                    type="button"
                    onClick={() => loadBrowsePath(browserData.parent_path!)}
                    className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-white hover:bg-slate-100 text-slate-700 text-[11px] border border-slate-700/60 font-medium"
                  >
                    <ChevronUp className="w-3 h-3" />
                    <span>Up</span>
                  </button>
                )}
              </div>

              {browserLoading ? (
                <div className="text-slate-400 text-center py-4 text-xs">Loading directories...</div>
              ) : (
                <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                  {browserData?.directories.map((dir) => (
                    <div
                      key={dir.path}
                      onClick={() => {
                        setPath(dir.path);
                        loadBrowsePath(dir.path);
                      }}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-white cursor-pointer text-slate-700 hover:text-slate-900 transition group border border-transparent hover:border-slate-200"
                    >
                      <div className="flex items-center space-x-1.5 truncate">
                        <Folder className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span className="truncate font-mono text-[11px]">{dir.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPath(dir.path);
                        }}
                        className="text-[10px] text-blue-600 font-semibold opacity-0 group-hover:opacity-100 transition"
                      >
                        Select
                      </button>
                    </div>
                  ))}
                  {browserData?.directories.length === 0 && (
                    <div className="text-slate-400 text-center py-2 text-[11px]">No subdirectories found.</div>
                  )}
                </div>
              )}

              {browserData?.current_path && (
                <div className="pt-2 border-t border-slate-700/40 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setPath(browserData.current_path)}
                    className="px-3 py-1 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[11px] font-medium transition"
                  >
                    Use &quot;{browserData.current_path.split('/').pop()}&quot; as Workspace
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Recent projects list */}
          {recentWorkspaces.length > 0 && !showBrowser && (
            <div>
              <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1.5 flex items-center space-x-1">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>Recent Projects:</span>
              </span>
              <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                {recentWorkspaces.map((recPath) => (
                  <div
                    key={recPath}
                    onClick={() => handlePickRecent(recPath)}
                    className="flex items-center space-x-2 p-2 rounded-xl bg-[#f8f9fd] hover:bg-slate-50 border border-slate-700/60 text-slate-700 hover:text-blue-700 cursor-pointer transition text-xs"
                  >
                    <Folder className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span className="truncate font-mono text-[11px] flex-1">{recPath}</span>
                    <span className="text-[10px] text-slate-400 shrink-0 font-medium">Open</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick preset suggestion */}
          <div className="bg-[#f8f9fd] border border-slate-700/60 rounded-xl p-3">
            <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
              Sample Workspace:
            </span>
            <button
              type="button"
              onClick={() => setPath('/Users/prasannahari/Projects/ForgeLocal/sample_workspace')}
              className="text-left font-mono text-[11px] text-blue-600 hover:underline break-all font-medium"
            >
              /Users/prasannahari/Projects/ForgeLocal/sample_workspace
            </button>
          </div>

          {/* Modal Footer */}
          <div className="pt-3 border-t border-slate-700/40 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !path.trim()}
              className="flex items-center space-x-1.5 px-5 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white transition text-xs font-medium shadow-[0_2px_8px_rgba(112,102,224,0.3)] disabled:opacity-50"
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
