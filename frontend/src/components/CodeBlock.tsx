import React, { useState } from 'react';
import { Copy, Check, Terminal, FileCode } from 'lucide-react';

interface CodeBlockProps {
  language: string;
  code: string;
  onApplyProposal?: () => void;
  showApply?: boolean;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  language,
  code,
  onApplyProposal,
  showApply,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  return (
    <div className="my-2.5 rounded-lg border border-navy-700/80 bg-navy-950 overflow-hidden text-xs font-mono shadow-sm">
      {/* Code block top bar */}
      <div className="h-7 bg-navy-900 border-b border-navy-700/80 px-3 flex items-center justify-between text-[11px] text-slate-400 select-none">
        <div className="flex items-center space-x-1.5">
          <FileCode className="w-3.5 h-3.5 text-blue-400" />
          <span className="font-semibold text-slate-300 uppercase text-[10px]">
            {language || 'code'}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {showApply && onApplyProposal && (
            <button
              onClick={onApplyProposal}
              className="flex items-center space-x-1 text-emerald-400 hover:text-emerald-300 font-sans text-[11px] font-medium transition"
              title="Apply change to file via approval"
            >
              <span>Apply to file</span>
            </button>
          )}

          <button
            onClick={handleCopy}
            className="flex items-center space-x-1 text-slate-400 hover:text-slate-200 transition font-sans text-[11px]"
            title="Copy snippet"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code content */}
      <div className="p-3 overflow-x-auto text-slate-200 leading-relaxed font-mono text-[12px] whitespace-pre selection:bg-blue-600/30">
        {code}
      </div>
    </div>
  );
};
