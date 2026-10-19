#!/usr/bin/env bash
# ForgeLocal — Launch Script for Local Offline AI Coding Agent

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "=========================================================="
echo " ForgeLocal — Offline AI Coding Agent"
echo " Apple Silicon / Mac Local Runtime"
echo " Backend: http://127.0.0.1:8000"
echo " Frontend: http://127.0.0.1:5173"
echo "=========================================================="

# Check local Ollama daemon
if ! curl -s http://127.0.0.1:11434/api/tags > /dev/null; then
    echo "⚠️  Ollama does not appear to be running on http://127.0.0.1:11434"
    echo "   Please start it in another terminal with: ollama serve"
    echo "   Ensure you have the model loaded: ollama run qwen2.5-coder:7b"
fi

# Activate Python Virtualenv
if [ -d "backend/.venv" ]; then
    source backend/.venv/bin/activate
else
    echo "Creating Python virtualenv in backend/.venv..."
    python3 -m venv backend/.venv
    source backend/.venv/bin/activate
    pip install -r backend/requirements.txt
fi

# Ensure frontend dependencies are installed
if [ ! -d "frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd frontend && npm install --cache "$DIR/.npm-cache" && cd "$DIR"
fi

echo "Starting ForgeLocal Backend on 127.0.0.1:8000..."
python3 backend/run.py &
BACKEND_PID=$!

echo "Starting ForgeLocal Frontend on 127.0.0.1:5173..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd "$DIR"

cleanup() {
    echo ""
    echo "Stopping ForgeLocal..."
    kill "$BACKEND_PID" 2>/dev/null || true
    kill "$FRONTEND_PID" 2>/dev/null || true
    exit 0
}

trap cleanup INT TERM

echo ""
echo "✨ ForgeLocal is running!"
echo "   Open your browser to: http://127.0.0.1:5173"
echo "   Press Ctrl+C to stop both servers."
echo ""

wait
