import React from 'react';
import {
  Compass,
  Bug,
  Sparkles,
  TestTube,
  Wand2,
  FileCode,
  Cpu,
  ShieldCheck,
  FolderOpen,
} from 'lucide-react';

interface WelcomeScreenProps {
  activeWorkspace: string | null;
  activeFilePath?: string;
  onSelectAction: (prompt: string, mode: string) => void;
  onOpenWorkspaceModal: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  activeWorkspace,
  activeFilePath,
  onSelectAction,
  onOpenWorkspaceModal,
}) => {
  const projectName = activeWorkspace ? activeWorkspace.split('/').pop() : null;

  const starterActions = [
    {
      id: 'explain-codebase',
      title: 'Explain this codebase',
      description: 'Analyze overall structure, entry points, and architectural flow.',
      icon: <Compass className="w-5 h-5 text-blue-400" />,
      prompt: activeWorkspace
        ? `Please inspect the codebase structure in '${activeWorkspace}' and explain its architecture, main modules, and entrypoints.`
        : 'Please explain the structure and best practices for organizing this local project.',
      mode: 'explain',
    },
    {
      id: 'find-bug',
      title: 'Find a bug',
      description: 'Inspect current implementation for potential edge cases and logic errors.',
      icon: <Bug className="w-5 h-5 text-amber-400" />,
      prompt: activeFilePath
        ? `Please analyze '${activeFilePath}' for potential edge cases, logic flaws, or security vulnerabilities.`
        : 'Please analyze the active project files for potential bugs or unhandled edge cases.',
      mode: 'fix',
    },
    {
      id: 'create-feature',
      title: 'Create a feature',
      description: 'Design and propose a new function or module with safe change proposals.',
      icon: <Sparkles className="w-5 h-5 text-indigo-400" />,
      prompt: 'Help me design and implement a new feature. What functionality should we add next?',
      mode: 'chat',
    },
    {
      id: 'write-tests',
      title: 'Write tests',
      description: 'Generate unit test suites covering standard cases and failure modes.',
      icon: <TestTube className="w-5 h-5 text-emerald-400" />,
      prompt: activeFilePath
        ? `Write comprehensive unit tests for '${activeFilePath}' covering success cases, edge cases, and exceptions.`
        : 'Help me write automated unit tests for the functions in this project.',
      mode: 'test',
    },
    {
      id: 'refactor-file',
      title: 'Refactor a file',
      description: 'Modernize syntax, improve readability, and propose clean updates.',
      icon: <Wand2 className="w-5 h-5 text-purple-400" />,
      prompt: activeFilePath
        ? `Review '${activeFilePath}' and propose a clean, idiomatic refactoring to improve modularity and clarity.`
        : 'Help me refactor the code to improve modularity, clean naming, and performance.',
      mode: 'refactor',
    },
    {
      id: 'explain-selected',
      title: 'Explain selected file',
      description: activeFilePath ? `Walk through logic in ${activeFilePath}` : 'Inspect active file details',
      icon: <FileCode className="w-5 h-5 text-cyan-400" />,
      prompt: activeFilePath
        ? `Walk me through '${activeFilePath}' line by line, explaining each function and its responsibility.`
        : 'Explain the open file and its key data structures.',
      mode: 'explain',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-4 py-8 md:py-12 max-w-4xl mx-auto flex flex-col items-center justify-center select-none text-center">
      {/* Hero Badge */}
      <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-navy-900 border border-navy-700/80 text-xs text-slate-300 mb-4 shadow-sm">
        <Cpu className="w-3.5 h-3.5 text-blue-400" />
        <span className="font-mono text-[11px]">qwen2.5-coder:7b</span>
        <span className="text-slate-500">•</span>
        <span className="text-emerald-400 font-medium">Apple Silicon (Offline)</span>
      </div>

      {/* Main Headline */}
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-100 mb-2">
        ForgeLocal Coding Agent
      </h1>
      <p className="text-xs md:text-sm text-slate-400 max-w-xl mb-6 leading-relaxed">
        Your private, offline AI pair programmer. Understand codebase architectures,
        draft safe code changes, and review proposed diffs before applying.
      </p>

      {/* Active Project context prompt */}
      {!activeWorkspace && (
        <div className="mb-6 p-3 bg-navy-900/80 border border-amber-600/40 rounded-lg flex items-center space-x-3 text-xs text-left max-w-md">
          <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="flex-1">
            <span className="text-slate-200 font-medium block">No project selected</span>
            <span className="text-slate-400 text-[11px]">Select a workspace folder to enable file inspection and test runs.</span>
          </div>
          <button
            onClick={onOpenWorkspaceModal}
            className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium transition shrink-0"
          >
            Open Project
          </button>
        </div>
      )}

      {/* 6 Starter Action Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full text-left">
        {starterActions.map((action) => (
          <button
            key={action.id}
            onClick={() => onSelectAction(action.prompt, action.mode)}
            className="group p-3.5 rounded-xl bg-navy-900/90 hover:bg-navy-850 border border-navy-700/80 hover:border-blue-500/50 transition-all duration-150 flex flex-col justify-between shadow-sm hover:shadow-md"
          >
            <div>
              <div className="mb-2 p-2 rounded-lg bg-navy-950 w-fit border border-navy-800 group-hover:border-navy-700 transition">
                {action.icon}
              </div>
              <h3 className="text-xs font-semibold text-slate-200 group-hover:text-blue-300 transition mb-1">
                {action.title}
              </h3>
              <p className="text-[11px] text-slate-400 leading-normal">
                {action.description}
              </p>
            </div>
            <span className="text-[10px] text-blue-400 font-medium mt-3 opacity-0 group-hover:opacity-100 transition flex items-center space-x-1">
              <span>Execute prompt</span>
              <span>→</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
