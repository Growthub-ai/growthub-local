from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .manifest import GrowthubModelManifestV1, current_repo_git_sha, read_manifest, write_manifest
from .paths import artifact_root, manifests_dir, repo_root


def _load_or_seed_manifest(root: Path, stage: str) -> GrowthubModelManifestV1:
    path = manifests_dir(root) / "latest.json"
    existing = read_manifest(path)
    if existing:
        return existing
    art = artifact_root(root)
    return GrowthubModelManifestV1(
        repo_git_sha=current_repo_git_sha(root),
        artifact_root=str(art),
        stages={stage: {"status": "registered", "message": "No prior manifest; seeded for this stage."}},
    )


def _persist_stage(root: Path, manifest: GrowthubModelManifestV1, stage: str, payload: dict) -> None:
    merged = dict(manifest.stages)
    merged[stage] = payload
    manifest.stages = merged
    write_manifest(manifests_dir(root) / "latest.json", manifest)


def run_stage(argv: list[str] | None, stage: str, tool_hint: str) -> int:
    parser = argparse.ArgumentParser(description=f"Pipeline stage: {stage}")
    parser.add_argument("--dry-run", action="store_true", help="Record intent only (no heavy work)")
    args, _unknown = parser.parse_known_args(argv)

    root = repo_root()
    manifest = _load_or_seed_manifest(root, stage)
    payload = {
        "status": "dry_run" if args.dry_run else "pending_implementation",
        "tool_hint": tool_hint,
        "message": f"Stage {stage!r} is wired; plug Unsloth, verl, distilabel, or vLLM here.",
    }
    _persist_stage(root, manifest, stage, payload)
    print(f"[{stage}] Updated manifest under {manifests_dir(root) / 'latest.json'}", file=sys.stderr)
    print(tool_hint, file=sys.stderr)
    return 0
