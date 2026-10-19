# ForgeLocal — Offline AI Coding Agent

ForgeLocal is a locally running AI pair-programmer and coding environment inspired by Claude Code, OpenAI Codex, and Google Antigravity. It is built specifically for **macOS on Apple Silicon** with **16 GB RAM**, using **Ollama** and the local **qwen2.5-coder:7b** model.

After the initial installation of dependencies and downloading your model weights, ForgeLocal operates **100% offline** without any external cloud APIs, CDN scripts, remote fonts, or telemetry.

---

## 🏛 Architecture Overview

```
                                      +---------------------------------------------+
                                      |                 Browser UI                  |
                                      |   React 19 + TypeScript + Tailwind CSS     |
                                      |   Offline Monaco Editor + Diff Viewer      |
                                      |   (Bound to http://127.0.0.1:5173)         |
                                      +----------------------+----------------------+
                                                             |
                                         REST / SSE Stream   | (127.0.0.1 Only)
                                                             v
+------------------------------------------------------------+----------------------+
|                                    ForgeLocal Backend                             |
|                           FastAPI + HTTPX + aiosqlite (Python 3.14)               |
|                               (Bound to http://127.0.0.1:8000)                    |
|                                                                                   |
|  +--------------------+  +----------------------+  +---------------------------+  |
|  |  Security Sandbox  |  |  Approvals Service   |  |   Command Runner          |  |
|  |  - Path Traversal  |  |  - Unified Diff Pre- |  |   - Explicit Allowlist    |  |
|  |  - Symlink Escape  |  |    view Calculation  |  |   - Subprocess exec (no   |  |
|  |  - Sensitive Block |  |  - Human-in-the-Loop |  |     shell=True injection) |  |
|  |  - Secret Scrubbing|  |    Audit Trail       |  |   - Timeouts & Byte Caps  |  |
|  +--------------------+  +----------------------+  +---------------------------+  |
|                                                                                   |
|  +-------------------------------------+  +------------------------------------+  |
|  | Local SQLite Database               |  | Local Ollama Async Client          |  |
|  | (Sessions, Messages, Approvals)     |  | (Streams to 127.0.0.1:11434)      |  |
|  +-------------------------------------+  +------------------------------------+  |
+------------------------------------------------------------+----------------------+
                                                             |
                                         Localhost Only      | HTTP / SSE
                                                             v
                                      +---------------------------------------------+
                                      |            Local Ollama Daemon              |
                                      |           Model: qwen2.5-coder:7b           |
                                      |       (http://127.0.0.1:11434/api/chat)     |
                                      +---------------------------------------------+
```

---

## 🛡 Security & Sandboxing Features

1. **Strict Workspace Boundary**:
   - File reads, writes, and deletions can only touch files within an explicitly chosen project workspace.
   - Any attempt at directory traversal (`../`) or symlink escaping is strictly blocked and raises HTTP 403 Forbidden.
2. **Sensitive File Masking**:
   - Files matching `.env*`, `*.key`, `*.pem`, `id_rsa`, `id_ed25519`, and `.git/config` are forbidden from read access.
3. **Secret Redactor**:
   - API keys, private keys, bearer tokens, and passwords are automatically scrubbed from chat logs and outputs.
4. **Mandatory Human-in-the-Loop Approvals**:
   - The AI agent **never** automatically writes to disk or executes shell commands.
   - When the agent suggests creating or changing a file or running tests, it generates an **Approval Proposal** with a pre-calculated unified diff.
   - The user must explicitly inspect the rationale and diff in the **Approval Screen** and click **Approve & Apply** before any file is touched.
5. **Controlled Subprocess Execution**:
   - Commands are validated against an explicit allowlist: `pytest`, `python3`, `npm`, `npx`, `node`, `git`, `ruff`, `black`, `flake8`, `mypy`, `cargo`, `go`, `ls`.
   - Executed as discrete argument vectors (`asyncio.create_subprocess_exec`) without `shell=True`, preventing shell injection attacks like `; rm -rf /`.
   - Hard execution timeouts (default 30 seconds) and output buffer limits (64 KB) prevent runaway processes.

---

## 🚀 Setup & Startup

### Step 1: Prerequisites
- Mac with Apple Silicon (M1/M2/M3/M4), macOS.
- Python 3.10+ (tested with Python 3.14).
- Node.js 18+ and npm.
- [Ollama](https://ollama.com) installed locally.

### Step 2: Download Model (Requires Internet Once)
In your terminal, pull the model:
```bash
ollama pull qwen2.5-coder:7b
```
Ensure Ollama is running:
```bash
ollama serve
```

### Step 3: Run ForgeLocal (1-Command Launcher)
From the root directory:
```bash
./start.sh
```

This will automatically:
1. Verify the Python virtual environment and dependencies.
2. Verify the React + Vite frontend packages.
3. Start the FastAPI backend on `http://127.0.0.1:8000`.
4. Start the Vite frontend dev server on `http://127.0.0.1:5173`.
5. Connect to local Ollama on `http://127.0.0.1:11434`.

Open your browser to:
**http://127.0.0.1:5173**

---

## 💻 Manual Startup (Alternative)

If you prefer starting each service manually in separate terminal tabs:

### Backend Tab
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py
```

### Frontend Tab
```bash
cd frontend
npm install --cache ../.npm-cache
npm run dev
```

---

## 🧪 Testing

### 1. Backend Test Suite
ForgeLocal comes with a comprehensive test suite covering sandboxing, path traversal protection, symlink escapes, secret redaction, command allowlists, timeout handling, approval lifecycles, and API endpoints.

To run tests:
```bash
source backend/.venv/bin/activate
PYTHONPATH=backend pytest backend/tests -v
```

### 2. Frontend Build Verification
To ensure all TypeScript types check out and Monaco Editor bundles offline:
```bash
cd frontend
npm run build
```

---

## 🗂 Sample Workspace Walkthrough

We included a pre-configured `sample_workspace/` directory so you can immediately test ForgeLocal.

1. In the ForgeLocal top bar, click **Select Workspace...**.
2. Click the preset link:
   ```
   /Users/prasannahari/Projects/ForgeLocal/sample_workspace
   ```
   and click **Open Workspace**.
3. In the left **Files** tab, click `calculator.py`. Notice it opens in the local Monaco Editor with syntax highlighting.
4. Click **Terminal** in the top bar and click the `pytest -v` preset button. You will see all 5 unit tests pass.
5. In the right **AI Pair Programmer** panel, type:
   > *"Add a factorial function to calculator.py, write unit tests for it in test_calculator.py, and propose running pytest."*
6. Watch `qwen2.5-coder:7b` stream its reasoning and generate a structured proposal.
7. Notice the **Approvals** button badge turn amber. Click **Review & Decide**.
8. Inspect the unified diff showing exact lines added and removed.
9. Click **Approve & Apply** to apply the changes to your workspace.
10. Click `pytest -v` in the Terminal panel to verify the new test passes!

---

## ⚙️ Configuration & Database

- **Database**: Local SQLite database located at `backend/data/forgelocal.db`. Contains sessions, messages, and approvals audit trail.
- **Settings**: Accessible via the gear icon in the top header:
  - Local Ollama API URL (`http://127.0.0.1:11434`)
  - Active Model Selection
  - Command Timeout (seconds)
  - Allowed Binaries Allowlist

---

## 🔍 Troubleshooting

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **"Ollama Offline" badge in header** | Ollama is not running on port 11434 | Run `ollama serve` in a terminal. |
| **Model not found error** | `qwen2.5-coder:7b` not pulled yet | Run `ollama pull qwen2.5-coder:7b`. |
| **"Security violation: Path traversal..."** | File path points outside the selected workspace | Verify relative file path is inside active workspace. |
| **Command blocked (HTTP 403)** | Binary is not in the security allowlist | Use allowed commands (`pytest`, `git`, `python3`, etc.) or add binary to settings allowlist. |
| **Port 8000 or 5173 in use** | An existing process is bound to that port | Check running processes with `lsof -i :8000` or `lsof -i :5173`. |
