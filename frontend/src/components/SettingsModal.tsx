import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, X, Save, Cpu, Shield, Globe, Sliders, Terminal } from 'lucide-react';
import { AppSettings, ModelInfo } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings | null;
  availableModels: ModelInfo[];
  onSave: (updated: Partial<AppSettings>) => Promise<void>;
  onClearHistory?: () => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  availableModels,
  onSave,
  onClearHistory,
}) => {
  const [ollamaUrl, setOllamaUrl] = useState('');
  const [model, setModel] = useState('');
  const [temperature, setTemperature] = useState(0.2);
  const [numCtx, setNumCtx] = useState(8192);
  const [numPredict, setNumPredict] = useState(2048);
  const [requestTimeout, setRequestTimeout] = useState(120);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setOllamaUrl(settings.ollama_base_url);
      setModel(settings.default_model);
      setTemperature(settings.temperature ?? 0.2);
      setNumCtx(settings.num_ctx ?? 8192);
      setNumPredict(settings.num_predict ?? 2048);
      setRequestTimeout(settings.request_timeout_seconds ?? 120);
    }
  }, [settings]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        ollama_base_url: ollamaUrl,
        default_model: model,
        temperature,
        num_ctx: numCtx,
        num_predict: numPredict,
        request_timeout_seconds: requestTimeout,
      });
      onClose();
    } catch (err) {
      alert(`Failed to save settings: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#1e1b4b]/40 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-white border border-slate-700/60 rounded-2xl shadow-[0_16px_40px_rgba(41,44,121,0.14)] max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden text-slate-800 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-700/40 flex items-center justify-between bg-[#f8f9fd] shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center border border-blue-200">
              <SettingsIcon className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-slate-800">My Intelligence Settings</h2>
              <p className="text-[11px] text-slate-400">Configure local model endpoint and safe generation parameters.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-200/60 text-slate-400 hover:text-slate-700 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
          {/* Ollama Base URL */}
          <div>
            <label className="block font-medium text-slate-700 mb-1 flex items-center space-x-1.5">
              <Globe className="w-3.5 h-3.5 text-blue-600" />
              <span>Local Ollama API Endpoint:</span>
            </label>
            <input
              type="text"
              value={ollamaUrl}
              onChange={(e) => setOllamaUrl(e.target.value)}
              placeholder="http://127.0.0.1:11434"
              className="w-full bg-[#f8f9fd] border border-slate-700/60 rounded-xl px-3 py-2 text-slate-800 font-mono text-xs focus:outline-none focus:border-blue-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Must point to localhost Ollama (127.0.0.1). No cloud credentials or external connections required.
            </p>
          </div>

          {/* Model selection */}
          <div>
            <label className="block font-medium text-slate-700 mb-1 flex items-center space-x-1.5">
              <Cpu className="w-3.5 h-3.5 text-blue-600" />
              <span>Installed Local Model:</span>
            </label>
            <div className="space-y-1.5">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full bg-[#f8f9fd] border border-slate-700/60 rounded-xl px-3 py-2 text-slate-800 font-mono text-xs focus:outline-none focus:border-blue-500"
              >
                {availableModels.length > 0 ? (
                  availableModels.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name} {m.parameter_size ? `(${m.parameter_size})` : ''}
                    </option>
                  ))
                ) : (
                  <option value="qwen2.5-coder:7b">qwen2.5-coder:7b (Default)</option>
                )}
              </select>
            </div>
            
            {/* Manual pull instructions */}
            <div className="mt-2 p-2.5 rounded-xl bg-[#f8f9fd] border border-slate-700/60 text-[11px] text-slate-600 flex items-start space-x-2">
              <Terminal className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <span>To install additional models locally, run in your terminal:</span>
                <code className="block mt-1 font-mono text-blue-600 text-[10px] bg-white px-2 py-0.5 rounded border border-slate-700/60 font-semibold">
                  ollama pull qwen2.5-coder:7b
                </code>
              </div>
            </div>
          </div>

          {/* Generation Limits for Apple Silicon */}
          <div className="pt-2 border-t border-slate-700/40 space-y-3">
            <span className="text-[10px] uppercase font-semibold text-slate-400 block flex items-center space-x-1">
              <Sliders className="w-3 h-3 text-blue-600" />
              <span>Generation Settings (Optimized for 16 GB Apple Silicon)</span>
            </span>

            {/* Temperature Slider */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-slate-700 font-medium">Temperature (Creativity vs Determinism):</span>
                <span className="font-mono text-blue-600 font-semibold">{temperature.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>0.0 (Precise/Code)</span>
                <span>0.5 (Balanced)</span>
                <span>1.0 (Creative)</span>
              </div>
            </div>

            {/* Context Window & Max Tokens */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Context Length (num_ctx):</label>
                <select
                  value={numCtx}
                  onChange={(e) => setNumCtx(parseInt(e.target.value))}
                  className="w-full bg-[#f8f9fd] border border-slate-700/60 rounded-xl px-2.5 py-1.5 text-slate-800 font-mono text-xs focus:outline-none"
                >
                  <option value={4096}>4,096 tokens</option>
                  <option value={8192}>8,192 tokens (Recommended)</option>
                  <option value={16384}>16,384 tokens (High RAM)</option>
                  <option value={32768}>32,768 tokens (Max)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Max Predict (num_predict):</label>
                <select
                  value={numPredict}
                  onChange={(e) => setNumPredict(parseInt(e.target.value))}
                  className="w-full bg-[#f8f9fd] border border-slate-700/60 rounded-xl px-2.5 py-1.5 text-slate-800 font-mono text-xs focus:outline-none"
                >
                  <option value={1024}>1,024 tokens</option>
                  <option value={2048}>2,048 tokens (Recommended)</option>
                  <option value={4096}>4,096 tokens</option>
                </select>
              </div>
            </div>

            {/* Allowed Commands */}
            <div>
              <label className="block text-slate-700 font-medium mb-1 flex items-center space-x-1.5">
                <Terminal className="w-3.5 h-3.5 text-blue-600" />
                <span>Command Execution Allowlist:</span>
              </label>
              <div className="bg-[#f8f9fd] border border-slate-700/60 rounded-xl p-2.5 font-mono text-[11px] text-slate-700">
                {settings?.allowed_commands?.join(', ') || 'pytest, python, npm, cargo, go'}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Commands outside this allowlist are strictly rejected before execution.
              </p>
            </div>

            {/* Clear All History Section */}
            {onClearHistory && (
              <div className="pt-2 border-t border-slate-700/40">
                <label className="block text-rose-700 mb-1 font-semibold">
                  Danger Zone: Reset Local History
                </label>
                <div className="flex items-center justify-between bg-rose-50 border border-rose-200 p-3 rounded-xl">
                  <div>
                    <span className="text-[11px] text-rose-900 block font-medium">Clear All History & Backups</span>
                    <span className="text-[10px] text-rose-600">Deletes all chat sessions, messages, task plans, and backups.</span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (confirm('Are you sure you want to permanently delete all history and backups? This cannot be undone.')) {
                        await onClearHistory();
                        onClose();
                      }
                    }}
                    className="px-3 py-1.5 rounded-full bg-rose-100 hover:bg-rose-200 text-rose-700 border border-rose-300 text-[11px] font-semibold transition"
                  >
                    Clear History
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="pt-3 border-t border-slate-700/40 flex items-center justify-end space-x-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center space-x-1.5 px-5 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white transition text-xs font-medium shadow-[0_2px_8px_rgba(112,102,224,0.3)] disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
