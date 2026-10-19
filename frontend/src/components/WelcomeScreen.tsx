import React from 'react';
import {
  Compass,
  Bug,
  Sparkles,
  TestTube,
  Wand2,
  FileCode,
  Cpu,
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
      icon: <Compass className="w-4 h-4 text-blue-600" />,
      prompt: activeWorkspace
        ? `Please inspect the codebase structure in '${activeWorkspace}' and explain its architecture, main modules, and entrypoints.`
        : 'Please explain the structure and best practices for organizing this local project.',
      mode: 'explain',
    },
    {
      id: 'find-bug',
      title: 'Find a bug',
      description: 'Inspect current implementation for potential edge cases and logic errors.',
      icon: <Bug className="w-4 h-4 text-amber-600" />,
      prompt: activeFilePath
        ? `Please analyze '${activeFilePath}' for potential edge cases, logic flaws, or security vulnerabilities.`
        : 'Please analyze the active project files for potential bugs or unhandled edge cases.',
      mode: 'fix',
    },
    {
      id: 'create-feature',
      title: 'Create a feature',
      description: 'Design and propose a new function or module with safe change proposals.',
      icon: <Sparkles className="w-4 h-4 text-indigo-600" />,
      prompt: 'Help me design and implement a new feature. What functionality should we add next?',
      mode: 'chat',
    },
    {
      id: 'write-tests',
      title: 'Write tests',
      description: 'Generate unit test suites covering standard cases and failure modes.',
      icon: <TestTube className="w-4 h-4 text-emerald-600" />,
      prompt: activeFilePath
        ? `Write comprehensive unit tests for '${activeFilePath}' covering success cases, edge cases, and exceptions.`
        : 'Help me write automated unit tests for the functions in this project.',
      mode: 'test',
    },
    {
      id: 'refactor-file',
      title: 'Refactor a file',
      description: 'Modernize syntax, improve readability, and propose clean updates.',
      icon: <Wand2 className="w-4 h-4 text-purple-600" />,
      prompt: activeFilePath
        ? `Review '${activeFilePath}' and propose a clean, idiomatic refactoring to improve modularity and clarity.`
        : 'Help me refactor the code to improve modularity, clean naming, and performance.',
      mode: 'refactor',
    },
    {
      id: 'explain-selected',
      title: 'Explain selected file',
      description: activeFilePath ? `Walk through logic in ${activeFilePath}` : 'Inspect active file details',
      icon: <FileCode className="w-4 h-4 text-cyan-600" />,
      prompt: activeFilePath
        ? `Walk me through '${activeFilePath}' line by line, explaining each function and its responsibility.`
        : 'Explain the open file and its key data structures.',
      mode: 'explain',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-4 py-8 md:py-10 max-w-4xl mx-auto flex flex-col items-center justify-center select-none text-center">
      {/* Hero Badge */}
      <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-white border border-slate-700/60 text-xs text-slate-400 mb-4 shadow-sm">
        <Cpu className="w-3.5 h-3.5 text-blue-600" />
        <span className="font-mono text-[11px] font-semibold text-slate-100">qwen2.5-coder:7b</span>
        <span className="text-slate-300">•</span>
        <span className="text-emerald-600 font-medium">Apple Silicon (Offline)</span>
      </div>

      {/* Floating AI Sphere in Agent Mode */}
      <div className="relative flex flex-col items-center justify-center mb-4">
        <div className="w-16 h-16 rounded-full bg-[radial-gradient(circle_at_35%_35%,#f472b6_0%,#c084fc_35%,#7066e0_70%,#4338ca_100%)] shadow-orb flex items-center justify-center ring-4 ring-white/50">
          <div className="flex items-center space-x-1.5">
            <span className="w-1.5 h-3 rounded-full bg-white/95" />
            <span className="w-1.5 h-3 rounded-full bg-white/95" />
          </div>
        </div>
      </div>

      {/* Main Headline */}
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-100 mb-2">
        My Intelligence Coding Workspace
      </h1>
      <p className="text-xs md:text-sm text-slate-400 max-w-xl mb-6 leading-relaxed">
        Autonomous, offline AI coding agent on your Mac. Inspect project trees, propose verified diffs, and execute tests with human authorization.
      </p>

      {/* Active Project context prompt */}
      {!activeWorkspace && (
        <div className="mb-6 p-3.5 bg-amber-50/80 border border-amber-200 rounded-2xl flex items-center space-x-3 text-xs text-left max-w-md shadow-sm">
          <FolderOpen className="w-4 h-4 text-amber-600 shrink-0" />
          <div className="flex-1">
            <span className="text-amber-950 font-semibold block">No project selected</span>
            <span className="text-amber-800 text-[11px]">Select a workspace folder to enable file inspection and test runs.</span>
          </div>
          <button
            onClick={onOpenWorkspaceModal}
            className="px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-[11px] font-semibold transition shrink-0 shadow-btn"
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
            className="group p-3.5 rounded-2xl bg-white hover:bg-slate-950 border border-slate-700/60 hover:border-blue-400 transition-all duration-150 flex flex-col justify-between shadow-card hover:shadow-elevated"
          >
            <div>
              <div className="mb-2.5 p-2 rounded-xl bg-blue-50 w-fit border border-blue-100 group-hover:scale-105 transition-transform">
                {action.icon}
              </div>
              <h3 className="text-xs font-semibold text-slate-100 group-hover:text-blue-600 transition mb-1">
                {action.title}
              </h3>
              <p className="text-[11px] text-slate-400 leading-normal">
                {action.description}
              </p>
            </div>
            <span className="text-[10px] text-blue-600 font-semibold mt-3 opacity-0 group-hover:opacity-100 transition flex items-center space-x-1">
              <span>Execute prompt</span>
              <span>→</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
