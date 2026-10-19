import React from 'react';

interface DiffViewerProps {
  diffText: string;
  filename?: string;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({ diffText, filename }) => {
  if (!diffText) {
    return (
      <div className="p-4 text-xs text-zinc-500 font-mono italic">
        No differences detected or binary file.
      </div>
    );
  }

  const lines = diffText.split('\n');

  return (
    <div className="font-mono text-xs overflow-x-auto rounded bg-zinc-950 p-3 border border-zinc-800">
      {filename && (
        <div className="text-zinc-400 font-semibold mb-2 pb-1 border-b border-zinc-800 text-[11px]">
          Diff: {filename}
        </div>
      )}
      <div className="space-y-0.5 leading-relaxed">
        {lines.map((line, idx) => {
          let lineClass = 'text-zinc-300';
          let bgClass = '';

          if (line.startsWith('+++') || line.startsWith('---')) {
            lineClass = 'text-zinc-400 font-bold';
            bgClass = 'bg-zinc-900/50';
          } else if (line.startsWith('+')) {
            lineClass = 'text-emerald-400';
            bgClass = 'bg-emerald-950/40';
          } else if (line.startsWith('-')) {
            lineClass = 'text-rose-400';
            bgClass = 'bg-rose-950/40';
          } else if (line.startsWith('@@')) {
            lineClass = 'text-blue-400 font-bold';
            bgClass = 'bg-blue-950/30';
          }

          return (
            <div key={idx} className={`px-2 py-0.5 rounded-sm whitespace-pre ${lineClass} ${bgClass}`}>
              {line || ' '}
            </div>
          );
        })}
      </div>
    </div>
  );
};
