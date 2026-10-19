"""Unit tests for workspace tree, file read/write, and diff generation."""

from pathlib import Path
from app.services.workspace import (
    build_directory_tree,
    generate_unified_diff,
    read_file_safely,
    search_in_workspace,
    write_file_safely,
)


def test_workspace_file_operations(tmp_path: Path):
    workspace = tmp_path / "project"
    workspace.mkdir()

    # Write file
    write_file_safely(str(workspace), "src/app.py", "def add(a, b):\n    return a + b\n")
    assert (workspace / "src" / "app.py").exists()

    # Read file
    read_res = read_file_safely(str(workspace), "src/app.py")
    assert read_res.relative_path == "src/app.py"
    assert "def add(a, b):" in read_res.content
    assert not read_res.is_binary

    # Build tree
    tree = build_directory_tree(workspace, workspace)
    assert tree.is_dir is True
    assert tree.children is not None
    assert len(tree.children) == 1  # 'src' folder
    assert tree.children[0].name == "src"
    assert len(tree.children[0].children) == 1
    assert tree.children[0].children[0].name == "app.py"


def test_generate_unified_diff():
    old = "def calculate(x):\n    return x * 2\n"
    new = "def calculate(x):\n    # Added validation\n    return x * 3\n"
    diff = generate_unified_diff(old, new, filename="calc.py")

    assert "--- a/calc.py" in diff
    assert "+++ b/calc.py" in diff
    assert "-    return x * 2" in diff
    assert "+    return x * 3" in diff


def test_search_in_workspace(tmp_path: Path):
    workspace = tmp_path / "search_proj"
    workspace.mkdir()

    (workspace / "a.py").write_text("def find_needle():\n    pass\n")
    (workspace / "b.txt").write_text("no match here")

    matches = search_in_workspace(str(workspace), "needle")
    assert len(matches) == 1
    assert matches[0].file_path == "a.py"
    assert matches[0].line_number == 1
    assert "def find_needle():" in matches[0].line_content
