import React, { useState } from 'react';
import { Copy, Check, FileCode } from 'lucide-react';

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
    <div className="my-3.5 rounded-2xl border border-[#9ea2ec]/35 bg-[#0f111e] overflow-hidden text-xs font-mono shadow-[0_6px_24px_rgba(15,17,30,0.18)]">
      {/* Code block top bar with macOS subtle controls & language pill */}
      <div className="h-9 bg-[#17192b] border-b border-white/[0.08] px-4 flex items-center justify-between text-[11px] select-none">
        <div className="flex items-center space-x-3">
          {/* Subtle mac window dots */}
          <div className="flex items-center space-x-1.5 opacity-75">
            <span className="w-2.5 h-2.5 rounded-full bg-[#f87171]/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#fbbf24]/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#34d399]/70" />
          </div>

          <div className="h-3 w-[1px] bg-white/10" />

          <div className="flex items-center space-x-1.5">
            <FileCode className="w-3.5 h-3.5 text-[#9ea2ec]" />
            <span className="font-semibold text-[#c5c8f8] uppercase text-[10px] tracking-wider font-mono">
              {language || 'code'}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {showApply && onApplyProposal && (
            <button
              onClick={onApplyProposal}
              className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 font-sans text-[11px] font-semibold transition border border-emerald-500/30"
              title="Apply change to file via approval"
            >
              <span>Apply to file</span>
            </button>
          )}

          <button
            onClick={handleCopy}
            className="flex items-center space-x-1.5 text-[#b3b7ed] hover:text-white transition font-sans text-[11px] px-2.5 py-1 rounded-full bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.08]"
            title="Copy snippet"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400 font-medium">Copied!</span>
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

      {/* Code content with high contrast developer styling and custom scrollbar */}
      <div className="p-4 overflow-x-auto text-[#f1f5f9] leading-relaxed font-mono text-[12.5px] whitespace-pre selection:bg-[#7066e0]/40">
        {code}
      </div>
    </div>
  );
};
