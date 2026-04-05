from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .manifest import GrowthubModelManifestV1, current_repo_git_sha, write_manifest
from .paths import artifact_root, base_model_dir, manifests_dir, repo_root


def run(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Bootstrap base weights layout and manifest.")
    parser.add_argument(
        "--model-id",
        default="google/gemma-4-26B-A4B-it",
        help="Hugging Face model id (default: primary MoE instruct variant)",
    )
    parser.add_argument(
        "--hf-revision",
        default=None,
        help="Optional HF revision (commit hash)",
    )
    parser.add_argument(
        "--download",
        action="store_true",
        help="Download weights via huggingface_hub (requires pip install '.[hf]')",
    )
    parser.add_argument("--dry-run", action="store_true", help="Create dirs + manifest only")
    args = parser.parse_args(argv)

    root = repo_root()
    art = artifact_root(root)
    dest = base_model_dir(root, args.model_id)
    dest.mkdir(parents=True, exist_ok=True)

    manifest_path = manifests_dir(root) / "latest.json"
    manifest = GrowthubModelManifestV1(
        base_model_id=args.model_id,
        hf_revision=args.hf_revision,
        artifact_root=str(art),
        repo_git_sha=current_repo_git_sha(root),
        stages={
            "bootstrap": {
                "status": "dry_run" if args.dry_run else "pending_download",
                "target_dir": str(dest),
            }
        },
        notes="OSS manifest only; weights and private datasets are never committed.",
    )

    if args.download and not args.dry_run:
        try:
            from huggingface_hub import snapshot_download  # type: ignore[import-not-found]
        except ImportError:
            print(
                "huggingface_hub not installed. Run: pip install -e 'packages/model-training[hf]'",
                file=sys.stderr,
            )
            return 1
        snapshot_download(
            repo_id=args.model_id,
            revision=args.hf_revision,
            local_dir=str(dest),
            local_dir_use_symlinks=False,
        )
        manifest.stages["bootstrap"] = {
            "status": "downloaded",
            "target_dir": str(dest),
        }

    write_manifest(manifest_path, manifest)
    print(f"Wrote manifest: {manifest_path}")
    print(f"Artifact root: {art}")
    print(f"Base model directory: {dest}")
    return 0
