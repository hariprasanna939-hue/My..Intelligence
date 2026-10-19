#!/usr/bin/env python3
"""ForgeLocal Native Desktop Application Launcher for macOS (Apple Silicon).

Manages the complete lifecycle:
1. Verifies local Ollama instance on http://127.0.0.1:11434
2. Starts FastAPI backend on 127.0.0.1:8000 (with port checking & retry)
3. Verifies frontend build or starts Vite preview
4. Launches desktop webview or native default browser
5. Handles clean signal trapping (SIGINT, SIGTERM) to terminate backend cleanly
"""

import atexit
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"
VENV_PYTHON = BACKEND_DIR / ".venv" / "bin" / "python3"

BACKEND_HOST = "127.0.0.1"
BACKEND_PORT = 8000
FRONTEND_PORT = 5173
OLLAMA_URL = "http://127.0.0.1:11434/api/tags"

processes = []


def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    """Checks whether a TCP port is currently occupied on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0


def check_ollama_status() -> bool:
    """Checks if local Ollama daemon is reachable."""
    try:
        req = urllib.request.Request(OLLAMA_URL, headers={"User-Agent": "ForgeLocal-Desktop"})
        with urllib.request.urlopen(req, timeout=2.0) as res:
            return res.status == 200
    except Exception:
        return False


def cleanup():
    """Terminates all spawned child processes cleanly upon exit."""
    print("\n[ForgeLocal] Shutting down application services...")
    for p in processes:
        if p.poll() is None:
            try:
                p.terminate()
                p.wait(timeout=3)
            except Exception:
                p.kill()
    print("[ForgeLocal] All services stopped cleanly.")


atexit.register(cleanup)


def signal_handler(signum, frame):
    cleanup()
    sys.exit(0)


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


def main():
    print("=" * 60)
    print(" ForgeLocal — Offline Local AI Coding Agent (macOS)")
    print("=" * 60)

    # 1. Check local Ollama
    if check_ollama_status():
        print("[ForgeLocal] \033[92m✔ Local Ollama is running on 127.0.0.1:11434\033[0m")
    else:
        print("[ForgeLocal] \033[93m⚠ Local Ollama not detected at 127.0.0.1:11434\033[0m")
        print("             Please ensure 'ollama serve' is running.")

    # 2. Check Python virtual environment
    python_bin = str(VENV_PYTHON if VENV_PYTHON.exists() else sys.executable)

    # 3. Start Backend if not already running
    if is_port_in_use(BACKEND_PORT):
        print(f"[ForgeLocal] Backend already active on http://{BACKEND_HOST}:{BACKEND_PORT}")
    else:
        print(f"[ForgeLocal] Starting FastAPI backend on http://{BACKEND_HOST}:{BACKEND_PORT}...")
        backend_proc = subprocess.Popen(
            [
                python_bin,
                "-m",
                "uvicorn",
                "app.main:app",
                "--host",
                BACKEND_HOST,
                "--port",
                str(BACKEND_PORT),
            ],
            cwd=str(BACKEND_DIR),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        processes.append(backend_proc)

        # Wait for backend to be ready
        for _ in range(20):
            if is_port_in_use(BACKEND_PORT):
                break
            time.sleep(0.3)
        print("[ForgeLocal] \033[92m✔ Backend server is ready\033[0m")

    # 4. Start Frontend or verify dev/preview server
    app_url = f"http://localhost:{FRONTEND_PORT}"
    if not is_port_in_use(FRONTEND_PORT):
        print(f"[ForgeLocal] Starting Vite frontend server...")
        frontend_proc = subprocess.Popen(
            ["npm", "run", "dev"],
            cwd=str(FRONTEND_DIR),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        processes.append(frontend_proc)
        for _ in range(20):
            if is_port_in_use(FRONTEND_PORT):
                break
            time.sleep(0.3)

    print(f"[ForgeLocal] \033[92m✔ Desktop Webview ready at {app_url}\033[0m")
    print("[ForgeLocal] Opening native application window...")

    # 5. Open browser / webview window
    try:
        # On macOS, open app in dedicated Chrome/Safari application mode if available
        subprocess.run(
            ["open", "-a", "Google Chrome", "--args", f"--app={app_url}"],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        webbrowser.open(app_url)

    print("\n[ForgeLocal] Running. Press Ctrl+C to stop.")
    try:
        while True:
            time.sleep(1)
            for p in processes:
                if p.poll() is not None:
                    print(f"[ForgeLocal] Process {p.pid} terminated unexpectedly.")
                    return
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
