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

  return <div className="space-y-3">{parts}</div>;
};

function renderTextChunk(text: string, keyPrefix: string) {
  const lines = text.split('\n');

  return (
    <div key={keyPrefix} className="space-y-2.5 leading-relaxed text-[#1e1b4b] font-normal text-[14.5px]">
      {lines.map((line, lIdx) => {
        if (!line.trim()) {
          return <div key={`${keyPrefix}-${lIdx}`} className="h-2" />;
        }

        // Headings (# Heading or ## Heading)
        if (line.startsWith('### ')) {
          return (
            <h4 key={`${keyPrefix}-${lIdx}`} className="text-sm font-semibold text-[#1e1b4b] mt-3 mb-1">
              {line.replace('### ', '')}
            </h4>
          );
        }
        if (line.startsWith('## ')) {
          return (
            <h3 key={`${keyPrefix}-${lIdx}`} className="text-base font-semibold text-[#1e1b4b] mt-3.5 mb-1.5 tracking-tight border-b border-[#9ea2ec]/20 pb-1">
              {line.replace('## ', '')}
            </h3>
          );
        }
        if (line.startsWith('# ')) {
          return (
            <h2 key={`${keyPrefix}-${lIdx}`} className="text-lg font-bold text-[#1e1b4b] mt-4 mb-2 tracking-tight">
              {line.replace('# ', '')}
            </h2>
          );
        }

        // Bullet lists (* or -)
        const isBullet = /^(\*|-)\s+/.test(line);
        const cleanLine = isBullet ? line.replace(/^(\*|-)\s+/, '') : line;

        // Render inline code spans and bold text (**bold**)
        const inlineCodeRegex = /`([^`]+)`/g;
        const inlineParts: React.ReactNode[] = [];
        let curIdx = 0;
        let inlineMatch: RegExpExecArray | null;

        while ((inlineMatch = inlineCodeRegex.exec(cleanLine)) !== null) {
          if (inlineMatch.index > curIdx) {
            inlineParts.push(renderFormattedSubtext(cleanLine.substring(curIdx, inlineMatch.index)));
          }
          inlineParts.push(
            <code
              key={`inline-${inlineMatch.index}`}
              className="px-2 py-0.5 mx-0.5 rounded-lg bg-[#f0effe] border border-[#9ea2ec]/40 font-mono text-[12px] font-medium text-[#5c4fe5]"
            >
              {inlineMatch[1]}
            </code>
          );
          curIdx = inlineMatch.index + inlineMatch[0].length;
        }

        if (curIdx < cleanLine.length) {
          inlineParts.push(renderFormattedSubtext(cleanLine.substring(curIdx)));
        }

        if (isBullet) {
          return (
            <div key={`${keyPrefix}-${lIdx}`} className="flex items-start space-x-2 pl-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#7066e0] mt-2 shrink-0" />
              <p className="flex-1 leading-relaxed">{inlineParts}</p>
            </div>
          );
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

function renderFormattedSubtext(text: string): React.ReactNode {
  // Support **bold** markdown
  const boldRegex = /\*\*([^*]+)\*\*/g;
  const parts: React.ReactNode[] = [];
  let curIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > curIdx) {
      parts.push(text.substring(curIdx, match.index));
    }
    parts.push(
      <strong key={`b-${match.index}`} className="font-semibold text-[#141238]">
        {match[1]}
      </strong>
    );
    curIdx = match.index + match[0].length;
  }

  if (curIdx < text.length) {
    parts.push(text.substring(curIdx));
  }

  return parts.length > 0 ? parts : text;
}
