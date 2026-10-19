import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

/**
 * Configure Monaco Editor to use the locally bundled monaco-editor package.
 * This guarantees 100% offline functionality without making any external CDN calls.
 */
export function initMonacoOffline() {
  loader.config({ monaco });
}

export function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'py':
      return 'python';
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'json':
      return 'json';
    case 'md':
      return 'markdown';
    case 'html':
      return 'html';
    case 'css':
      return 'css';
    case 'yaml':
    case 'yml':
      return 'yaml';
    case 'sh':
    case 'bash':
    case 'zsh':
      return 'shell';
    case 'sql':
      return 'sql';
    case 'rs':
      return 'rust';
    case 'go':
      return 'go';
    default:
      return 'plaintext';
  }
}
