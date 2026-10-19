import React, { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  FileCode,
  FileJson,
  Terminal,
  Trash2,
} from 'lucide-react';
import { FileNode } from '../types';

interface FileTreeProps {
  node: FileNode;
  activeFilePath?: string;
  searchQuery?: string;
  onSelectFile: (path: string) => void;
  onDeleteFile?: (path: string) => void;
}

function getFileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'py':
      return <span className="text-yellow-400 font-mono text-[11px] font-bold">Py</span>;
    case 'ts':
    case 'tsx':
      return <span className="text-blue-400 font-mono text-[11px] font-bold">TS</span>;
    case 'js':
    case 'jsx':
      return <span className="text-amber-300 font-mono text-[11px] font-bold">JS</span>;
    case 'json':
      return <FileJson className="w-3.5 h-3.5 text-orange-400" />;
    case 'md':
      return <FileText className="w-3.5 h-3.5 text-blue-300" />;
    case 'sh':
    case 'bash':
    case 'zsh':
      return <Terminal className="w-3.5 h-3.5 text-emerald-400" />;
    case 'toml':
    case 'yaml':
    case 'yml':
      return <span className="text-purple-400 font-mono text-[10px] font-bold">CFG</span>;
    default:
      return <FileCode className="w-3.5 h-3.5 text-slate-400" />;
  }
}

// Check if node or any of its children match search
function matchesSearch(node: FileNode, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q)) {
    return true;
  }
  if (node.is_dir && node.children) {
    return node.children.some((c) => matchesSearch(c, query));
  }
  return false;
}

export const FileTree: React.FC<FileTreeProps> = ({
  node,
  activeFilePath,
  searchQuery = '',
  onSelectFile,
  onDeleteFile,
}) => {
  const [isOpen, setIsOpen] = useState(true);

  if (!node) return null;

  // Filter out non-matching branches if search is active
  if (searchQuery && !matchesSearch(node, searchQuery)) {
    return null;
  }

  if (node.is_dir) {
    const isRoot = node.path === '' || node.path === '.';
    const autoOpen = searchQuery ? true : isOpen;

    return (
      <div className="select-none text-xs">
        {!isRoot && (
          <div
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center space-x-1.5 py-1 px-2 rounded hover:bg-navy-800/60 cursor-pointer text-slate-300 hover:text-white transition group"
          >
            {autoOpen ? (
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300" />
            )}
            {autoOpen ? (
              <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-blue-400" />
            )}
            <span className="font-medium truncate text-slate-200">{node.name}</span>
          </div>
        )}

        {(autoOpen || isRoot) && node.children && (
          <div className={!isRoot ? 'pl-3.5 border-l border-navy-800/80 ml-2 mt-0.5 space-y-0.5' : 'space-y-0.5'}>
            {node.children.map((child) => (
              <FileTree
                key={child.path}
                node={child}
                activeFilePath={activeFilePath}
                searchQuery={searchQuery}
                onSelectFile={onSelectFile}
                onDeleteFile={onDeleteFile}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Regular File item
  const isActive = activeFilePath === node.path;

  return (
    <div
      onClick={() => onSelectFile(node.path)}
      className={`group flex items-center justify-between py-1 px-2 rounded cursor-pointer transition text-xs ${
        isActive
          ? 'bg-blue-600/20 text-blue-300 font-medium border-l-2 border-blue-500'
          : 'text-slate-400 hover:text-slate-200 hover:bg-navy-800/50'
      }`}
    >
      <div className="flex items-center space-x-2 truncate min-w-0 flex-1">
        <div className="w-4 flex items-center justify-center shrink-0">
          {getFileIcon(node.name)}
        </div>
        <span className="truncate">{node.name}</span>
      </div>

      <div className="flex items-center space-x-1.5 shrink-0 ml-2">
        {node.formatted_size && (
          <span className="text-[10px] text-slate-500 font-mono hidden group-hover:inline">
            {node.formatted_size}
          </span>
        )}

        {onDeleteFile && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Are you sure you want to delete '${node.name}'?`)) {
                onDeleteFile(node.path);
              }
            }}
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-rose-400 rounded transition"
            title="Delete file"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
};
