# ForgeLocal — macOS Application Packaging Architecture & Evaluation

## 1. Executive Summary

ForgeLocal runs an on-device local coding agent targeting Apple Silicon Macs (16 GB unified RAM).
Because local 7B models (`qwen2.5-coder:7b`) require approximately 4.5 GB to 5.5 GB of unified memory during active context inference, preserving system RAM and eliminating redundant runtime overhead is a primary architectural requirement.

---

## 2. Framework Comparison Matrix

| Metric | Option A: Native Wrapper + WKWebView (Selected) | Option B: Tauri v2 | Option C: Electron |
| :--- | :--- | :--- | :--- |
| **Idle Memory Overhead** | **~25 MB** | **~35 MB** | 180 MB - 350 MB |
| **App Bundle Size** | **< 15 MB** | **< 20 MB** | 180 MB - 280 MB |
| **Chromium Process Overhead**| **Zero** (Uses system WebKit) | **Zero** (Uses system WebKit) | High (Bundles private Chromium) |
| **Node.js Process Overhead** | **Zero** | **Zero** | High (Bundles private Node runtime) |
| **Apple Silicon (M1/M2/M3/M4) Optimization** | **Native ARM64** | **Native ARM64** | Universal / Heavy |
| **Subprocess Orchestration** | Native Python `subprocess` with signal traps | Rust `std::process` | Node `child_process` |
| **Offline Suitability** | 100% Offline (Localhost loopback) | 100% Offline | 100% Offline |
| **Maintenance Complexity** | Minimal (Standard macOS bundle & Python) | Moderate (Requires Rust toolchain) | High (Frequent Chromium CVE patches) |

---

## 3. Why Electron Was Rejected

1. **Memory Competition with Local LLMs:** On a 16 GB unified memory Mac, macOS allocates shared memory between GPU (Metal) and CPU. Electron launches multiple helper processes (Browser, GPU, Renderers, Crashpad) consuming 300+ MB before code is even edited.
2. **Duplicate Runtimes:** The system already possesses Apple Silicon-optimized WebKit and Python 3.14. Electron bundles redundant copies of Chromium and Node.js.
3. **Bundle Bloat:** Electron installer packages exceed 200 MB, whereas the native ForgeLocal distribution is under 15 MB.

---

## 4. Why Native macOS App Bundle (`ForgeLocal.app`) + WebKit Was Chosen

1. **Direct Memory Efficiency:** Running FastAPI with Uvicorn and native WebKit leaves over 11 GB of unified memory free for model weights and KV cache.
2. **Standard macOS Integration:** Double-clickable `.app` bundle registered in Finder and Dock with `Info.plist` and standard signal handling (`SIGINT`, `SIGTERM`).
3. **Graceful Subprocess Lifecycle:** `desktop/forge_local_app.py` actively checks localhost ports, confirms Ollama connectivity, starts the backend, handles browser launch in application window mode, and ensures clean termination of all child processes on exit.
