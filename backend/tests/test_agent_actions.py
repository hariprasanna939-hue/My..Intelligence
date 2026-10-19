"""Unit tests for agent action extraction and fallback parsing."""

from app.services.agent import extract_actions


def test_extract_actions_standard_json():
    text = """Here is the proposed change:
```forgelocal-action
{
  "action": "propose_file_write",
  "path": "test.py",
  "content": "print('hello')",
  "reason": "Add test script"
}
```
Let me know if this looks good.
"""
    actions = extract_actions(text)
    assert len(actions) == 1
    assert actions[0]["action"] == "propose_file_write"
    assert actions[0]["path"] == "test.py"
    assert actions[0]["content"] == "print('hello')"
    assert actions[0]["reason"] == "Add test script"


def test_extract_actions_triple_quotes_fallback():
    text = """Sure! Here is the action:
```forgelocal-action
{
  "action": "propose_file_write",
  "path": "calculator.py",
  "content": \"\"\"def square(x):
    return x * x
\"\"\",
  "reason": "Adding a square function"
}
```
"""
    actions = extract_actions(text)
    assert len(actions) == 1
    assert actions[0]["action"] == "propose_file_write"
    assert actions[0]["path"] == "calculator.py"
    assert "def square(x):" in actions[0]["content"]
    assert "Adding a square function" in actions[0]["reason"]


def test_extract_command_action():
    text = """Let's test:
```forgelocal-action
{
  "action": "propose_command",
  "command_args": ["pytest", "-v", "tests/"],
  "reason": "Run test suite"
}
```
"""
    actions = extract_actions(text)
    assert len(actions) == 1
    assert actions[0]["action"] == "propose_command"
    assert actions[0]["command_args"] == ["pytest", "-v", "tests/"]
