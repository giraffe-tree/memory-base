"""Fetch upstream code and fast-forward disposable latest views, preserving research pins.

Only Git operations are performed: no upstream code, dependency installers, tests
or submodules are executed. Dirty, unrelated or divergent views are left intact.
"""
from __future__ import annotations

import fcntl
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REFERENCES = ROOT / "refernece"
UPSTREAMS = (
    ("ReMe", "https://github.com/agentscope-ai/ReMe.git"),
    ("mem0", "https://github.com/mem0ai/mem0.git"),
)


def git(directory: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(directory), *args],
        capture_output=True,
        text=True,
        timeout=180,
        env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
    )
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return result.stdout.strip()


def common_dir(directory: Path) -> Path:
    return (directory / git(directory, "rev-parse", "--git-common-dir")).resolve()


def update(name: str, repository: str) -> dict:
    pinned = REFERENCES / name
    if not (pinned / ".git").exists():
        raise RuntimeError(f"Missing source checkout: {pinned}. See README source setup.")
    if git(pinned, "remote", "get-url", "origin") != repository:
        raise RuntimeError(f"Unexpected origin for {name}; no changes made.")
    pin_before = git(pinned, "rev-parse", "HEAD")
    # Explicit refspec also works with the shallow single-branch research clones.
    git(pinned, "fetch", "--no-tags", "origin", "refs/heads/main:refs/remotes/origin/main")
    upstream = git(pinned, "rev-parse", "refs/remotes/origin/main")
    latest = REFERENCES / "latest" / name
    latest.parent.mkdir(parents=True, exist_ok=True)
    created = not latest.exists()
    if created:
        git(pinned, "worktree", "add", "--detach", str(latest), upstream)
        before = None
    else:
        if not (latest / ".git").exists() or common_dir(latest) != common_dir(pinned):
            raise RuntimeError(f"{latest} is not the expected linked worktree; left unchanged.")
        if git(latest, "status", "--porcelain"):
            raise RuntimeError(f"{latest} has local changes; left unchanged.")
        before = git(latest, "rev-parse", "HEAD")
        # No reset, stash or force update. Rewritten/divergent history fails safely.
        git(latest, "merge", "--ff-only", "--no-edit", upstream)
    after = git(latest, "rev-parse", "HEAD")
    if git(pinned, "rev-parse", "HEAD") != pin_before:
        raise RuntimeError(f"Research pin unexpectedly changed for {name}.")
    return {
        "project": name,
        "research_commit": pin_before,
        "latest_commit": after,
        "updated": before != after,
        "created": created,
        "latest_path": str(latest.relative_to(ROOT)),
    }


def main() -> int:
    REFERENCES.mkdir(parents=True, exist_ok=True)
    results = []
    with (REFERENCES / ".update.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print(json.dumps({"error": "Another upstream update is already running."}))
            return 1
        for name, repository in UPSTREAMS:
            try:
                results.append(update(name, repository))
            except Exception as error:
                results.append({"project": name, "error": str(error)})
    print(json.dumps({"results": results}, ensure_ascii=False, indent=2))
    return 1 if any("error" in row for row in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
