"""Live demonstration of ForgeLocal AI coding agent diagnosing and fixing calculator.py."""

import asyncio
import json
from pathlib import Path
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.database import get_db_connection, init_db
from app.main import app
from app.services.approvals import resolve_approval

SAMPLE_WS = Path(__file__).resolve().parent / "sample_workspace"


async def run_demonstration():
    print("=" * 65)
    print(" ForgeLocal Live Agent Demonstration")
    print(" Goal: Find bug in calculator.py, propose fix, wait for approval")
    print("=" * 65)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://127.0.0.1:8000", timeout=120.0) as client:
        # 1. Set active workspace to sample_workspace
        ws_res = await client.post("/api/workspace", json={"workspace_path": str(SAMPLE_WS)})
        print(f"\n1. Active Workspace set to: {ws_res.json()['active_workspace']}")

        # 2. Ask ForgeLocal to find the bug and propose a fix
        prompt = (
            "Examine calculator.py. The test_average test is failing because of an off-by-one error in average(). "
            "Propose a fix for calculator.py using a ```forgelocal-action block with action 'propose_file_edit' and path 'calculator.py', "
            "providing the complete corrected content of calculator.py so I can review the diff and approve it."
        )
        print(f"\n2. User Prompt:\n\"{prompt}\"")
        print("\n3. Streaming Agent Loop (Real local Ollama execution)...")

        created_approvals = []
        full_response = []
        plan_steps = []

        res = await client.post(
            "/api/chat/stream",
            json={
                "content": prompt,
                "mode": "fix",
                "current_file_path": "calculator.py",
                "workspace_path": str(SAMPLE_WS),
            },
        )

        for block in res.text.split("\n\n"):
            if not block.strip():
                continue
            event_type = None
            event_data = ""
            for l in block.splitlines():
                if l.startswith("event: "):
                    event_type = l[7:].strip()
                elif l.startswith("data: "):
                    event_data = l[6:].strip()

            if event_type == "plan":
                print("   [Event] Task Plan generated and stored")
            elif event_type == "tool_start":
                print(f"   [Event] Tool called: {event_data}")
            elif event_type == "tool_result":
                print(f"   [Event] Tool result returned to model")
            elif event_type == "chunk" and event_data:
                try:
                    data = json.loads(event_data)
                    full_response.append(data.get("chunk", ""))
                except Exception:
                    pass
            elif event_type == "approvals" and event_data:
                try:
                    data = json.loads(event_data)
                    created_approvals = data.get("approvals", [])
                    print(f"   [Event] Generated {len(created_approvals)} pending approval(s) requiring human authorization")
                except Exception:
                    pass

        print("\n4. Assistant Response:")
        print("".join(full_response)[:500] + "...")

        # 5. Check if approval was created
        if created_approvals:
            apprv = created_approvals[0]
            print("\n5. Pending Approval Item Created in SQLite:")
            print(f"   ID:          {apprv['id']}")
            print(f"   Action:      {apprv['action_type']}")
            print(f"   Target:      {apprv['target_path']}")
            print(f"   Status:      {apprv['status']}")
            print(f"   Diff Preview:\n{apprv['diff']}")

            # 6. User simulates clicking Approve & Apply
            print("\n6. User Decision: Approving and Applying fix...")
            applied = await resolve_approval(apprv["id"], "approve", str(SAMPLE_WS))
            print(f"   Status after approval: {applied.status}")

            # 7. Re-run tests to confirm bug is fixed
            print("\n7. Running pytest to verify bugfix...")
            test_res = await client.post(
                "/api/commands/run",
                json={"command_args": ["pytest", "-v"]},
            )
            print(f"   Test exit code: {test_res.json()['return_code']}")
            print(f"   Test output snippet:\n{test_res.json()['stdout'][:300]}")

            # 8. Test Revert functionality
            print("\n8. Testing Revert functionality...")
            reverted = await client.post(f"/api/approvals/{apprv['id']}/revert")
            print(f"   Reverted status: {reverted.json()['status']}")
            print("   ✔ Successfully demonstrated full lifecycle: plan -> read -> propose diff -> wait for approval -> apply -> verify tests -> revert")
        else:
            print("\n⚠ Note: Model answered directly without action block or Ollama cold load.")

    print("\n" + "=" * 65)


if __name__ == "__main__":
    asyncio.run(run_demonstration())
