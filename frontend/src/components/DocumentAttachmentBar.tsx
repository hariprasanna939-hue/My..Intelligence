import React, { useState } from 'react';
import {
  FileText,
  Paperclip,
  X,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  BookOpen,
  Sparkles,
  ChevronDown,
} from 'lucide-react';
import { DocumentMetadata, DocumentProcessingStatus } from '../types';

interface DocumentAttachmentBarProps {
  documents: DocumentMetadata[];
  onUploadFile: (file: File) => Promise<void>;
  onDeleteDocument: (id: string) => Promise<void>;
  onSummarizeDocument?: (id: string, type: string) => Promise<void>;
  uploading: boolean;
  uploadProgressText?: string;
  className?: string;
}

export const DocumentAttachmentBar: React.FC<DocumentAttachmentBarProps> = ({
  documents,
  onUploadFile,
  onDeleteDocument,
  onSummarizeDocument,
  uploading,
  uploadProgressText,
  className = '',
}) => {
  const [selectedDocForSummary, setSelectedDocForSummary] = useState<string | null>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusBadge = (status: DocumentProcessingStatus) => {
    switch (status) {
      case 'ready':
        return (
          <span className="flex items-center space-x-1 text-emerald-600 font-medium text-[10px]">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            <span>Ready</span>
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center space-x-1 text-rose-600 font-medium text-[10px]">
            <AlertCircle className="w-3 h-3 text-rose-500" />
            <span>Error</span>
          </span>
        );
      default:
        return (
          <span className="flex items-center space-x-1 text-blue-600 font-medium text-[10px]">
            <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />
            <span className="capitalize">{status}...</span>
          </span>
        );
    }
  };

  const summaryTypes = [
    { key: 'quick', label: 'Quick Summary' },
    { key: 'detailed', label: 'Detailed Summary' },
    { key: 'key_points', label: 'Key Points' },
    { key: 'dates_deadlines', label: 'Important Dates & Deadlines' },
    { key: 'risks_limitations', label: 'Risks & Limitations' },
    { key: 'action_items', label: 'Action Items' },
    { key: 'qa', label: 'Questions & Answers' },
    { key: 'section_by_section', label: 'Section-by-Section' },
  ];

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Uploading progress notification */}
      {uploading && (
        <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs shadow-xs animate-pulse">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 shrink-0" />
          <span className="truncate">{uploadProgressText || 'Validating, extracting and indexing document...'}</span>
        </div>
      )}

      {/* List of attached documents */}
      {documents.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className={`flex items-center space-x-2 px-3 py-1 rounded-xl text-xs border transition shadow-xs shrink-0 ${
                doc.status === 'ready'
                  ? 'bg-white border-slate-700/60 text-slate-800'
                  : doc.status === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-blue-50/60 border-blue-200 text-blue-800'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <div className="flex flex-col max-w-[140px] truncate">
                <span className="font-medium truncate text-[11px]">{doc.filename}</span>
                <span className="text-[9px] text-slate-400 font-mono">
                  {formatFileSize(doc.file_size)} • {doc.chunk_count} chunks
                </span>
              </div>

              {/* Status */}
              <div className="shrink-0">{getStatusBadge(doc.status)}</div>

              {/* Summarize Dropdown trigger */}
              {doc.status === 'ready' && onSummarizeDocument && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedDocForSummary(selectedDocForSummary === doc.id ? null : doc.id)
                    }
                    className="p-1 rounded-full hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition"
                    title="Summarize Document"
                  >
                    <Sparkles className="w-3 h-3" />
                  </button>

                  {/* Summary Type Menu */}
                  {selectedDocForSummary === doc.id && (
                    <div className="absolute bottom-full left-0 mb-2 w-48 bg-white border border-slate-700/60 rounded-xl shadow-[0_8px_24px_rgba(41,44,121,0.12)] p-1.5 z-30 animate-in fade-in zoom-in-95">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-1 border-b border-slate-100">
                        Summarize Mode
                      </div>
                      <div className="space-y-0.5 mt-1 max-h-48 overflow-y-auto">
                        {summaryTypes.map((st) => (
                          <button
                            key={st.key}
                            type="button"
                            onClick={() => {
                              setSelectedDocForSummary(null);
                              onSummarizeDocument(doc.id, st.key);
                            }}
                            className="w-full text-left px-2 py-1 text-[11px] text-slate-700 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition"
                          >
                            {st.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Delete / Detach action */}
              <button
                type="button"
                onClick={() => onDeleteDocument(doc.id)}
                className="p-1 rounded-full hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition"
                title="Remove document"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
