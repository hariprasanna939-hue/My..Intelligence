import React, { useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { X, Save, FileCode } from 'lucide-react';
import { OpenFileTab } from '../types';

interface EditorAreaProps {
  tabs: OpenFileTab[];
  activeTabPath?: string;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onChangeContent: (path: string, newContent: string) => void;
  onSaveFile: (path: string) => void;
  onSelectionChange?: (selectedText: string) => void;
}

export const EditorArea: React.FC<EditorAreaProps> = ({
  tabs,
  activeTabPath,
  onSelectTab,
  onCloseTab,
  onChangeContent,
  onSaveFile,
  onSelectionChange,
}) => {
  const activeTab = tabs.find((t) => t.path === activeTabPath);

  // Keyboard shortcut listener for Save (Cmd+S / Ctrl+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (activeTab && activeTab.isDirty) {
          onSaveFile(activeTab.path);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, onSaveFile]);

  if (!activeTab) {
    return (
      <div className="flex-1 bg-editor-bg flex flex-col items-center justify-center text-zinc-500 select-none">
        <FileCode className="w-12 h-12 mb-3 text-zinc-600 opacity-60" />
        <p className="text-sm font-medium text-zinc-400">No file open</p>
        <p className="text-xs text-zinc-600 mt-1">
          Select a file from the explorer to view, edit, or ask My Intelligence to review.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-editor-bg flex flex-col overflow-hidden">
      {/* File Tabs Bar */}
      <div className="h-9 bg-editor-sidebar border-b border-editor-border flex items-center justify-between select-none px-2 overflow-x-auto">
        <div className="flex items-center space-x-1 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = tab.path === activeTabPath;
            return (
              <div
                key={tab.path}
                onClick={() => onSelectTab(tab.path)}
                className={`group flex items-center space-x-2 px-3 py-1.5 text-xs rounded-t cursor-pointer border-t-2 transition ${
                  isActive
                    ? 'bg-editor-bg text-zinc-200 border-blue-500 font-medium'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 border-transparent'
                }`}
              >
                <span className="truncate max-w-[150px]">{tab.name}</span>
                {tab.isDirty && (
                  <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" title="Unsaved changes" />
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.path);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white transition"
                  title="Close tab"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Action button */}
        <div className="flex items-center space-x-2 shrink-0 pl-2">
          {activeTab.isDirty && (
            <button
              onClick={() => onSaveFile(activeTab.path)}
              className="flex items-center space-x-1 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition shadow-sm"
              title="Save changes (Ctrl+S / Cmd+S)"
            >
              <Save className="w-3 h-3" />
              <span>Save</span>
            </button>
          )}
        </div>
      </div>

      {/* Monaco Editor Container */}
      <div className="flex-1 relative">
        <Editor
          height="100%"
          language={activeTab.language}
          value={activeTab.content}
          theme="vs-dark"
          options={{
            fontSize: 13,
            fontFamily: 'SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace',
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 4,
            wordWrap: 'on',
            lineNumbers: 'on',
            renderWhitespace: 'selection',
            bracketPairColorization: { enabled: true },
          }}
          onChange={(val) => {
            onChangeContent(activeTab.path, val || '');
          }}
          onMount={(editor) => {
            if (onSelectionChange) {
              editor.onDidChangeCursorSelection((e) => {
                const model = editor.getModel();
                if (model) {
                  const selected = model.getValueInRange(e.selection);
                  onSelectionChange(selected);
                }
              });
            }
          }}
        />
      </div>
    </div>
  );
};
