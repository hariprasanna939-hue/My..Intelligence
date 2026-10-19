export interface ModelInfo {
  name: string;
  size?: number;
  modified_at?: string;
  parameter_size?: string;
  quantization_level?: string;
}

export interface HealthResponse {
  status: string;
  version: string;
  ollama_connected: boolean;
  ollama_url: string;
  active_model: string;
  available_models: ModelInfo[];
  active_workspace?: string | null;
}

export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  size?: number | null;
  language?: string | null;
  formatted_size?: string | null;
  children?: FileNode[] | null;
}

export interface FileReadResponse {
  path: string;
  relative_path: string;
  content: string;
  size: number;
  is_binary: boolean;
  language?: string;
  formatted_size?: string;
  total_lines?: number;
  start_line?: number;
  end_line?: number;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  is_accessible: boolean;
}

export interface BrowseDirectoryResponse {
  current_path: string;
  parent_path?: string | null;
  directories: DirectoryEntry[];
  is_valid_workspace: boolean;
}

export interface ProjectSummaryResponse {
  workspace_name: string;
  workspace_path: string;
  total_files_scanned: number;
  languages: [string, number][];
  top_level_directories: string[];
  detected_manifests: string[];
  test_runner?: string | null;
  manifest_details: Record<string, any>;
}

export interface OpenFileTab {
  path: string;
  name: string;
  content: string;
  originalContent: string;
  isDirty: boolean;
  language: string;
}

export interface ApprovalItem {
  id: string;
  session_id?: string | null;
  action_type: 'write_file' | 'patch_file' | 'delete_file' | 'run_command';
  target_path?: string | null;
  content?: string | null;
  original_content?: string | null;
  diff?: string | null;
  command_args?: string[] | null;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed' | 'reverted';
  execution_result?: string | null;
  created_at: string;
  resolved_at?: string | null;
}

export interface TaskPlan {
  id: string;
  steps: string[];
  status: 'in_progress' | 'completed' | 'failed';
  task_description?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ToolActivity {
  tool: string;
  args?: any;
  result?: any;
  iteration: number;
  status: 'running' | 'completed' | 'error';
}

export interface TestExecutionRecord {
  id: string;
  session_id?: string | null;
  command: string;
  working_dir: string;
  return_code: number;
  passed_tests: number;
  failed_tests: number;
  skipped_tests: number;
  stdout: string;
  stderr: string;
  execution_time_ms: number;
  timed_out: boolean;
  created_at: string;
}

export interface ChatSession {
  id: string;
  title: string;
  workspace_path?: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: any;
  tool_results?: any;
  created_at: string;
}

export interface CommandResult {
  command: string;
  return_code: number;
  stdout: string;
  stderr: string;
  execution_time_ms: number;
  timed_out: boolean;
}

export interface AppSettings {
  ollama_base_url: string;
  default_model: string;
  temperature?: number;
  num_ctx?: number;
  num_predict?: number;
  request_timeout_seconds?: number;
  allowed_commands: string[];
  command_timeout_seconds: number;
  max_file_size_bytes: number;
  active_workspace?: string | null;
}

export type DocumentProcessingStatus =
  | 'uploaded'
  | 'validating'
  | 'extracting'
  | 'chunking'
  | 'indexing'
  | 'ready'
  | 'error';

export interface DocumentMetadata {
  id: string;
  session_id?: string | null;
  filename: string;
  file_type: string;
  file_size: number;
  status: DocumentProcessingStatus;
  page_count: number;
  extracted_char_count: number;
  chunk_count: number;
  extraction_warnings: string[];
  ocr_used: boolean;
  created_at: string;
  updated_at: string;
}

export interface DocumentQuestionResponse {
  answer: string;
  citations: string[];
  chunks_used: number;
}

export interface DocumentSummaryResponse {
  document_id: string;
  summary_type: string;
  summary: string;
  cached: boolean;
  chunks_analyzed: any;
}


export type AppWorkingMode = 'chat' | 'agent';

