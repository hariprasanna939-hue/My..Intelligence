"""Project Understanding and Code Context Intelligence Service.

Provides secure tools for local project analysis:
1. Workspace file cataloging with size, language, and limits
2. Filename search and pattern matching
3. Code content search with line numbers and snippet extraction
4. Safe file reading with optional line range support (start_line, end_line)
5. Package manifest and build configuration inspection (package.json, pyproject.toml, etc.)
6. Concise project summary generation from actual files
7. Automated relevant context gathering for model reasoning
"""

import fnmatch
import json
import logging
import os
from pathlib import Path
import re
from typing import Any, Dict, List, Optional, Set, Tuple
from fastapi import HTTPException

from app.config import settings
from app.schemas import FileSearchMatch
from app.security import is_sensitive_path, resolve_safe_path, sanitize_text, validate_workspace_directory

logger = logging.getLogger("forgelocal.project_understanding")

# Common directories to exclude from project scans
EXCLUDED_DIRECTORIES: Set[str] = {
    ".git",
    "node_modules",
    "__pycache__",
    ".pytest_cache",
    ".venv",
    "venv",
    "env",
    ".idea",
    ".vscode",
    "dist",
    "build",
    ".next",
    ".cache",
    ".npm-cache",
    "coverage",
    ".turbo",
    "target",
    "out",
}

# Binary and non-source extensions to skip for text search and reading
BINARY_EXTENSIONS: Set[str] = {
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".webp", ".pdf",
    ".zip", ".tar", ".gz", ".7z", ".rar", ".bz2", ".xz",
    ".exe", ".bin", ".dylib", ".so", ".dll", ".pyc", ".pyd",
    ".db", ".sqlite", ".sqlite3", ".parquet", ".arrow", ".pkl",
    ".wasm", ".woff", ".woff2", ".ttf", ".eot", ".mp3", ".mp4",
}

# Extension to language map for metadata and syntax highlighting
LANGUAGE_EXTENSIONS: Dict[str, str] = {
    ".py": "python",
    ".ts": "typescript",
    ".tsx": "typescriptreact",
    ".js": "javascript",
    ".jsx": "javascriptreact",
    ".json": "json",
    ".html": "html",
    ".css": "css",
    ".scss": "scss",
    ".md": "markdown",
    ".yml": "yaml",
    ".yaml": "yaml",
    ".toml": "toml",
    ".rs": "rust",
    ".go": "go",
    ".java": "java",
    ".c": "c",
    ".cpp": "cpp",
    ".h": "c",
    ".hpp": "cpp",
    ".sh": "shell",
    ".bash": "shell",
    ".zsh": "shell",
    ".sql": "sql",
}

# Known manifest filenames to inspect
MANIFEST_FILENAMES = [
    "package.json",
    "pyproject.toml",
    "requirements.txt",
    "setup.py",
    "Pipfile",
    "Cargo.toml",
    "go.mod",
    "pom.xml",
    "build.gradle",
    "Makefile",
    "docker-compose.yml",
    "Dockerfile",
    "tsconfig.json",
    "README.md",
]


def detect_language(file_path: Path) -> str:
    """Detects programming language from file extension or filename."""
    name_lower = file_path.name.lower()
    if name_lower == "dockerfile":
        return "dockerfile"
    if name_lower == "makefile":
        return "makefile"
    ext = file_path.suffix.lower()
    return LANGUAGE_EXTENSIONS.get(ext, "plaintext")


def format_file_size(size_bytes: int) -> str:
    """Formats file size into human-readable representation."""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    else:
        return f"{size_bytes / (1024 * 1024):.1f} MB"


# ---------------------------------------------------------------------------
# 1. Workspace File Cataloging
# ---------------------------------------------------------------------------

def list_workspace_files(
    workspace_root: str | Path,
    max_depth: int = 5,
    max_files: int = 500,
) -> List[Dict[str, Any]]:
    """Lists non-ignored files within the workspace up to safe bounds.
    
    Returns list of dicts: relative_path, name, size, formatted_size, is_binary, language.
    """
    root_path = validate_workspace_directory(str(workspace_root))
    file_list: List[Dict[str, Any]] = []

    def _walk(current: Path, depth: int):
        if depth > max_depth or len(file_list) >= max_files:
            return

        try:
            items = sorted(list(current.iterdir()), key=lambda p: (not p.is_dir(), p.name.lower()))
        except PermissionError:
            return

        for item in items:
            if len(file_list) >= max_files:
                break

            name = item.name
            # Skip excluded directories and hidden files/dirs (except allowed manifests)
            if item.is_dir():
                if name in EXCLUDED_DIRECTORIES or name.startswith("."):
                    continue
                _walk(item, depth + 1)
            elif item.is_file():
                # Skip sensitive files
                if is_sensitive_path(name):
                    continue
                
                try:
                    rel_p = str(item.relative_to(root_path))
                    stat = item.stat()
                    is_bin = item.suffix.lower() in BINARY_EXTENSIONS
                    lang = detect_language(item)
                    file_list.append({
                        "relative_path": rel_p,
                        "name": name,
                        "size": stat.st_size,
                        "formatted_size": format_file_size(stat.st_size),
                        "is_binary": is_bin,
                        "language": lang,
                    })
                except Exception:
                    continue

    _walk(root_path, 0)
    return file_list


# ---------------------------------------------------------------------------
# 2. Filename Search
# ---------------------------------------------------------------------------

def search_filenames(
    workspace_root: str | Path,
    pattern: str,
    max_results: int = 50,
) -> List[Dict[str, Any]]:
    """Searches filenames in workspace by wildcard pattern or substring."""
    root_path = validate_workspace_directory(str(workspace_root))
    clean_pat = pattern.strip()
    if not clean_pat:
        return []

    # If pattern does not contain wildcards, make it a substring search
    is_glob = any(char in clean_pat for char in ["*", "?", "["])
    glob_pat = clean_pat.lower() if is_glob else f"*{clean_pat.lower()}*"

    matches: List[Dict[str, Any]] = []

    for item in list_workspace_files(root_path, max_depth=6, max_files=1000):
        if len(matches) >= max_results:
            break
        
        name_lower = item["name"].lower()
        path_lower = item["relative_path"].lower()

        if fnmatch.fnmatch(name_lower, glob_pat) or fnmatch.fnmatch(path_lower, glob_pat):
            matches.append(item)

    return matches


# ---------------------------------------------------------------------------
# 3. Code Content Search
# ---------------------------------------------------------------------------

def search_code_content(
    workspace_root: str | Path,
    query: str,
    file_extensions: Optional[List[str]] = None,
    max_results: int = 40,
) -> List[FileSearchMatch]:
    """Searches plain text case-insensitively across non-binary source files."""
    root_path = validate_workspace_directory(str(workspace_root))
    clean_q = query.strip()
    if not clean_q:
        return []

    q_lower = clean_q.lower()
    matches: List[FileSearchMatch] = []
    allowed_exts = {e.lower() if e.startswith(".") else f".{e.lower()}" for e in file_extensions} if file_extensions else None

    for item in list_workspace_files(root_path, max_depth=6, max_files=1000):
        if len(matches) >= max_results:
            break
        if item["is_binary"]:
            continue

        rel_path = item["relative_path"]
        target = root_path / rel_path
        if allowed_exts and target.suffix.lower() not in allowed_exts:
            continue

        try:
            with open(target, "r", encoding="utf-8", errors="ignore") as f:
                for line_no, line in enumerate(f, start=1):
                    if q_lower in line.lower():
                        sanitized_content = sanitize_text(line.strip()[:240])
                        matches.append(
                            FileSearchMatch(
                                file_path=rel_path,
                                line_number=line_no,
                                line_content=sanitized_content,
                            )
                        )
                        if len(matches) >= max_results:
                            break
        except Exception:
            continue

    return matches


# ---------------------------------------------------------------------------
# 4. Safe File Reading with Line Ranges
# ---------------------------------------------------------------------------

def read_file_range(
    workspace_root: str | Path,
    relative_path: str,
    start_line: Optional[int] = None,
    end_line: Optional[int] = None,
) -> Dict[str, Any]:
    """Reads a file with security checks, secret sanitization, and optional line ranges.
    
    start_line and end_line are 1-indexed inclusive.
    """
    target = resolve_safe_path(workspace_root, relative_path)

    if not target.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {relative_path}")
    if not target.is_file():
        raise HTTPException(status_code=400, detail=f"Path is not a regular file: {relative_path}")

    size = target.stat().st_size
    if size > settings.MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File size ({size} bytes) exceeds maximum limit ({settings.MAX_FILE_SIZE_BYTES} bytes).",
        )

    if target.suffix.lower() in BINARY_EXTENSIONS:
        return {
            "path": str(target),
            "relative_path": relative_path,
            "content": "[Binary file preview not supported]",
            "size": size,
            "formatted_size": format_file_size(size),
            "is_binary": True,
            "language": detect_language(target),
            "total_lines": 0,
            "start_line": 1,
            "end_line": 0,
        }

    try:
        raw_text = target.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return {
            "path": str(target),
            "relative_path": relative_path,
            "content": "[Binary or non-UTF-8 content]",
            "size": size,
            "formatted_size": format_file_size(size),
            "is_binary": True,
            "language": detect_language(target),
            "total_lines": 0,
            "start_line": 1,
            "end_line": 0,
        }

    all_lines = raw_text.splitlines()
    total_lines = len(all_lines)

    if start_line is None and end_line is None:
        sanitized_content = sanitize_text(raw_text)
        s_line = 1
        e_line = total_lines
    else:
        s_line = max(1, start_line) if start_line is not None else 1
        e_line = min(total_lines, end_line) if end_line is not None else total_lines
        if total_lines == 0:
            slice_lines = []
        else:
            slice_lines = all_lines[s_line - 1 : e_line]
        sliced_content = "\n".join(slice_lines)
        sanitized_content = sanitize_text(sliced_content)

    return {
        "path": str(target),
        "relative_path": relative_path,
        "content": sanitized_content,
        "size": size,
        "formatted_size": format_file_size(size),
        "is_binary": False,
        "language": detect_language(target),
        "total_lines": total_lines,
        "start_line": s_line,
        "end_line": e_line,
    }


# ---------------------------------------------------------------------------
# 5. Project Manifests & Build Inspection
# ---------------------------------------------------------------------------

def inspect_project_manifests(workspace_root: str | Path) -> Dict[str, Any]:
    """Inspects package manifests, configuration files, and dependency definitions."""
    root_path = validate_workspace_directory(str(workspace_root))
    detected_manifests: Dict[str, Any] = {}

    for manifest in MANIFEST_FILENAMES:
        manifest_path = root_path / manifest
        if not manifest_path.exists() or not manifest_path.is_file():
            continue

        try:
            content = manifest_path.read_text(encoding="utf-8", errors="replace")
            # Parse package.json if present
            if manifest == "package.json":
                try:
                    pkg_data = json.loads(content)
                    detected_manifests["package.json"] = {
                        "name": pkg_data.get("name"),
                        "version": pkg_data.get("version"),
                        "scripts": pkg_data.get("scripts", {}),
                        "dependencies": list(pkg_data.get("dependencies", {}).keys()),
                        "devDependencies": list(pkg_data.get("devDependencies", {}).keys()),
                    }
                except Exception:
                    detected_manifests["package.json"] = {"raw": content[:500]}

            elif manifest in ("requirements.txt", "Pipfile"):
                lines = [l.strip() for l in content.splitlines() if l.strip() and not l.startswith("#")]
                detected_manifests[manifest] = {
                    "dependencies": lines[:30],
                    "total_count": len(lines),
                }

            elif manifest == "pyproject.toml":
                detected_manifests["pyproject.toml"] = {
                    "summary": content[:800],
                }

            elif manifest == "Cargo.toml":
                detected_manifests["Cargo.toml"] = {
                    "summary": content[:600],
                }

            elif manifest == "go.mod":
                detected_manifests["go.mod"] = {
                    "summary": content[:400],
                }

            elif manifest == "README.md":
                # First 20 lines of README
                readme_lines = [l for l in content.splitlines()[:25] if l.strip()]
                detected_manifests["README.md"] = {
                    "intro": "\n".join(readme_lines),
                }

            else:
                detected_manifests[manifest] = {
                    "exists": True,
                    "preview": content[:300],
                }
        except Exception as e:
            logger.warning(f"Error inspecting manifest {manifest}: {e}")

    return detected_manifests


# ---------------------------------------------------------------------------
# 6. Concise Project Summary
# ---------------------------------------------------------------------------

def build_project_summary(workspace_root: str | Path) -> Dict[str, Any]:
    """Generates a concise, truthful overview of the project structure and tech stack."""
    root_path = validate_workspace_directory(str(workspace_root))
    all_files = list_workspace_files(root_path, max_depth=4, max_files=300)

    # Language breakdown
    lang_counts: Dict[str, int] = {}
    for f in all_files:
        lang = f["language"]
        if lang != "plaintext":
            lang_counts[lang] = lang_counts.get(lang, 0) + 1

    # Top-level directory layout
    top_level_dirs = []
    try:
        for p in sorted(root_path.iterdir()):
            if p.is_dir() and p.name not in EXCLUDED_DIRECTORIES and not p.name.startswith("."):
                top_level_dirs.append(p.name)
    except Exception:
        pass

    # Manifests
    manifests = inspect_project_manifests(root_path)

    # Detected test runner
    test_runner = None
    if (root_path / "pytest.ini").exists() or (root_path / "tests").exists() or any("pytest" in f["relative_path"] for f in all_files):
        test_runner = "pytest"
    elif "package.json" in manifests and "test" in manifests["package.json"].get("scripts", {}):
        test_runner = f"npm test ({manifests['package.json']['scripts']['test']})"
    elif (root_path / "Cargo.toml").exists():
        test_runner = "cargo test"
    elif (root_path / "go.mod").exists():
        test_runner = "go test"

    return {
        "workspace_name": root_path.name,
        "workspace_path": str(root_path),
        "total_files_scanned": len(all_files),
        "languages": sorted(lang_counts.items(), key=lambda x: x[1], reverse=True),
        "top_level_directories": top_level_dirs,
        "detected_manifests": list(manifests.keys()),
        "test_runner": test_runner,
        "manifest_details": manifests,
    }


# ---------------------------------------------------------------------------
# 7. Automated Relevant Context Gathering for Model Reasoning
# ---------------------------------------------------------------------------

STOP_WORDS = {
    "the", "and", "for", "with", "that", "this", "from", "why", "what", "how",
    "when", "where", "can", "could", "should", "would", "is", "are", "was", "were",
    "not", "please", "code", "file", "make", "create", "write", "edit", "fix",
}

def extract_search_keywords(user_prompt: str) -> List[str]:
    """Extracts meaningful identifiers, filenames, and topics from a user prompt."""
    tokens = re.findall(r"[a-zA-Z0-9_\-\.]+", user_prompt)
    keywords = []
    for t in tokens:
        clean = t.strip(".-_")
        if len(clean) >= 3 and clean.lower() not in STOP_WORDS:
            keywords.append(clean)
    return list(dict.fromkeys(keywords))[:6]


def gather_project_context(
    workspace_root: Optional[str | Path],
    user_prompt: str,
    current_file_path: Optional[str] = None,
) -> str:
    """Gathers truthful, grounded code evidence from the actual project files.
    
    Prevents hallucination by retrieving real files, snippets, and manifests
    matching the user query, and explicitly informing the agent if terms are not found.
    """
    if not workspace_root:
        return "No workspace active. Context gathering skipped."

    root_path = validate_workspace_directory(str(workspace_root))
    context_sections = []

    # 1. Project Summary Header
    summary = build_project_summary(root_path)
    langs_str = ", ".join(f"{lang} ({cnt})" for lang, cnt in summary["languages"][:4]) if summary["languages"] else "Unknown"
    manifests_str = ", ".join(summary["detected_manifests"]) if summary["detected_manifests"] else "None"
    
    header = (
        f"PROJECT ARCHITECTURE OVERVIEW:\n"
        f"- Root: {summary['workspace_name']} ({summary['workspace_path']})\n"
        f"- Dominant Languages: {langs_str}\n"
        f"- Top Directories: {', '.join(summary['top_level_directories']) or 'None'}\n"
        f"- Key Manifests: {manifests_str}\n"
        f"- Detected Test Suite: {summary['test_runner'] or 'None'}"
    )
    context_sections.append(header)

    # 2. Extract keywords and search actual files
    keywords = extract_search_keywords(user_prompt)
    relevant_files_found: List[str] = []
    code_snippets: List[str] = []

    for kw in keywords:
        # Match filenames
        file_matches = search_filenames(root_path, f"*{kw}*", max_results=3)
        for fm in file_matches:
            if fm["relative_path"] not in relevant_files_found:
                relevant_files_found.append(fm["relative_path"])

        # Match code text
        content_matches = search_code_content(root_path, kw, max_results=4)
        for cm in content_matches:
            if cm.file_path not in relevant_files_found and len(relevant_files_found) < 5:
                relevant_files_found.append(cm.file_path)
            snippet = f"  [{cm.file_path}:{cm.line_number}] {cm.line_content}"
            if snippet not in code_snippets and len(code_snippets) < 10:
                code_snippets.append(snippet)

    # Read up to 3 most relevant files (first 60 lines each)
    files_context = []
    for rel_p in relevant_files_found[:3]:
        if rel_p == current_file_path:
            continue  # Focused file already loaded separately
        try:
            f_data = read_file_range(root_path, rel_p, start_line=1, end_line=65)
            if not f_data["is_binary"]:
                files_context.append(
                    f"--- File: {rel_p} (lines 1-{f_data['end_line']} of {f_data['total_lines']}) ---\n"
                    f"```{f_data['language']}\n{f_data['content']}\n```"
                )
        except Exception:
            continue

    if code_snippets:
        context_sections.append(
            "RELEVANT CODE OCCURRENCES FOUND FOR PROMPT:\n" + "\n".join(code_snippets)
        )

    if files_context:
        context_sections.append(
            "RELEVANT PROJECT SOURCE FILES:\n" + "\n\n".join(files_context)
        )

    if not relevant_files_found and keywords:
        context_sections.append(
            f"NOTE: Searches for prompt keywords {keywords} yielded no matching files or symbols in this workspace."
        )

    return "\n\n".join(context_sections)
