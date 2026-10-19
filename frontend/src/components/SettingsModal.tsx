import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, X, Save, Cpu, Shield, Globe } from 'lucide-react';
import { AppSettings, ModelInfo } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings | null;
  availableModels: ModelInfo[];
  onSave: (updated: Partial<AppSettings>) => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  availableModels,
  onSave,
}) => {
  const [ollamaUrl, setOllamaUrl] = useState('');
  const [model, setModel] = useState('');
  const [timeoutSec, setTimeoutSec] = useState(30);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setOllamaUrl(settings.ollama_base_url);
      setModel(settings.default_model);
      setTimeoutSec(settings.command_timeout_seconds);
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
        command_timeout_seconds: timeoutSec,
      });
      onClose();
    } catch (err) {
      alert(`Failed to save settings: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-navy-900 border border-navy-700/80 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden text-slate-100 animate-in fade-in zoom-in-95 duration-150">
        <div className="px-5 py-3.5 border-b border-navy-800 flex items-center justify-between bg-navy-950">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
              <SettingsIcon className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-slate-100">ForgeLocal Settings</h2>
              <p className="text-[11px] text-slate-400">Configure local model endpoint and sandbox controls.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-navy-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {/* Ollama Base URL */}
          <div>
            <label className="block font-medium text-slate-200 mb-1 flex items-center space-x-1.5">
              <Globe className="w-3.5 h-3.5 text-blue-400" />
              <span>Local Ollama API Endpoint:</span>
            </label>
            <input
              type="text"
              value={ollamaUrl}
              onChange={(e) => setOllamaUrl(e.target.value)}
              placeholder="http://127.0.0.1:11434"
              className="w-full bg-navy-950 border border-navy-700 rounded-lg px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-blue-500/80"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Must point to localhost Ollama (127.0.0.1). No cloud credentials or external connections required.
            </p>
          </div>

          {/* Model selection */}
          <div>
            <label className="block font-medium text-slate-200 mb-1 flex items-center space-x-1.5">
              <Cpu className="w-3.5 h-3.5 text-blue-400" />
              <span>Coding Model:</span>
            </label>
            <div className="space-y-1.5">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full bg-navy-950 border border-navy-700 rounded-lg px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-blue-500/80"
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
            <p className="text-[11px] text-slate-400 mt-1">
              Optimized for fast local execution on Apple Silicon (16 GB unified memory).
            </p>
          </div>

          {/* Timeout */}
          <div>
            <label className="block font-medium text-slate-200 mb-1 flex items-center space-x-1.5">
              <Shield className="w-3.5 h-3.5 text-blue-400" />
              <span>Command Execution Timeout (seconds):</span>
            </label>
            <input
              type="number"
              min={5}
              max={300}
              value={timeoutSec}
              onChange={(e) => setTimeoutSec(Number(e.target.value))}
              className="w-full bg-navy-950 border border-navy-700 rounded-lg px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-blue-500/80"
            />
          </div>

          {/* Allowed Commands Preview */}
          {settings && (
            <div className="bg-navy-950 p-3 rounded-lg border border-navy-800">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1.5">
                Security Sandbox: Allowed Command Binaries
              </span>
              <div className="flex flex-wrap gap-1 font-mono text-[10px]">
                {settings.allowed_commands.map((cmd) => (
                  <span key={cmd} className="px-2 py-0.5 rounded bg-navy-900 text-slate-300 border border-navy-800">
                    {cmd}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-navy-800 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-navy-800 hover:bg-navy-750 text-slate-300 transition text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition text-xs font-medium shadow-sm disabled:opacity-50"
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
