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
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-editor-panel border border-editor-border rounded-lg shadow-2xl max-w-lg w-full overflow-hidden text-zinc-100 animate-in fade-in zoom-in-95 duration-150">
        <div className="px-5 py-3.5 border-b border-editor-border flex items-center justify-between bg-zinc-900/80">
          <div className="flex items-center space-x-2">
            <SettingsIcon className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-semibold tracking-wide">ForgeLocal Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {/* Ollama Base URL */}
          <div>
            <label className="block font-medium text-zinc-300 mb-1 flex items-center space-x-1.5">
              <Globe className="w-3.5 h-3.5 text-zinc-400" />
              <span>Local Ollama API Endpoint:</span>
            </label>
            <input
              type="text"
              value={ollamaUrl}
              onChange={(e) => setOllamaUrl(e.target.value)}
              placeholder="http://127.0.0.1:11434"
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-100 font-mono text-xs focus:outline-none focus:border-blue-500"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Must point to local Ollama on 127.0.0.1. No external cloud credentials required.
            </p>
          </div>

          {/* Model selection */}
          <div>
            <label className="block font-medium text-zinc-300 mb-1 flex items-center space-x-1.5">
              <Cpu className="w-3.5 h-3.5 text-zinc-400" />
              <span>Coding Model:</span>
            </label>
            <div className="space-y-1.5">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-100 font-mono text-xs focus:outline-none focus:border-blue-500"
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
            <p className="text-[11px] text-zinc-500 mt-1">
              Selected model is optimized for offline coding on Apple Silicon.
            </p>
          </div>

          {/* Timeout */}
          <div>
            <label className="block font-medium text-zinc-300 mb-1 flex items-center space-x-1.5">
              <Shield className="w-3.5 h-3.5 text-zinc-400" />
              <span>Command Execution Timeout (seconds):</span>
            </label>
            <input
              type="number"
              min={5}
              max={300}
              value={timeoutSec}
              onChange={(e) => setTimeoutSec(Number(e.target.value))}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-100 font-mono text-xs focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Allowed Commands Preview */}
          {settings && (
            <div className="bg-zinc-950 p-3 rounded border border-zinc-800">
              <span className="text-[10px] uppercase font-semibold text-zinc-500 block mb-1">
                Security Sandbox: Allowed Command Binaries
              </span>
              <div className="flex flex-wrap gap-1 font-mono text-[10px]">
                {settings.allowed_commands.map((cmd) => (
                  <span key={cmd} className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                    {cmd}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-editor-border flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center space-x-1 px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white transition text-xs font-medium shadow disabled:opacity-50"
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
