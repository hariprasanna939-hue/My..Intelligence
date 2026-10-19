import React from 'react';
import { CodeBlock } from './CodeBlock';

interface MarkdownMessageProps {
  content: string;
  onApplyProposal?: (path: string, content: string) => void;
}

export const MarkdownMessage: React.FC<MarkdownMessageProps> = ({ content }) => {
  if (!content) return null;

  // Split by fenced code blocks: ```lang ... ```
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const textBefore = content.substring(lastIndex, match.index);
    if (textBefore) {
      parts.push(renderTextChunk(textBefore, `text-${lastIndex}`));
    }

    const language = match[1] || 'plaintext';
    const code = match[2];
    parts.push(
      <CodeBlock
        key={`code-${match.index}`}
        language={language}
        code={code}
      />
    );

    lastIndex = match.index + match[0].length;
  }

  const remaining = content.substring(lastIndex);
  if (remaining) {
    parts.push(renderTextChunk(remaining, `text-${lastIndex}`));
  }

  return <div className="space-y-1">{parts}</div>;
};

function renderTextChunk(text: string, keyPrefix: string) {
  // Render paragraphs and inline `code`
  const lines = text.split('\n');

  return (
    <div key={keyPrefix} className="space-y-2 leading-relaxed text-slate-200">
      {lines.map((line, lIdx) => {
        if (!line.trim()) {
          return <div key={`${keyPrefix}-${lIdx}`} className="h-1.5" />;
        }

        // Render inline code spans
        const inlineCodeRegex = /`([^`]+)`/g;
        const inlineParts: React.ReactNode[] = [];
        let curIdx = 0;
        let inlineMatch: RegExpExecArray | null;

        while ((inlineMatch = inlineCodeRegex.exec(line)) !== null) {
          if (inlineMatch.index > curIdx) {
            inlineParts.push(line.substring(curIdx, inlineMatch.index));
          }
          inlineParts.push(
            <code
              key={`inline-${inlineMatch.index}`}
              className="px-1.5 py-0.5 rounded bg-navy-950 border border-navy-700/80 font-mono text-[11px] text-blue-300"
            >
              {inlineMatch[1]}
            </code>
          );
          curIdx = inlineMatch.index + inlineMatch[0].length;
        }

        if (curIdx < line.length) {
          inlineParts.push(line.substring(curIdx));
        }

        return (
          <p key={`${keyPrefix}-${lIdx}`} className="leading-relaxed">
            {inlineParts}
          </p>
        );
      })}
    </div>
  );
}
