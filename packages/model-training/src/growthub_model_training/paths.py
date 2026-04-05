from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path


def repo_root() -> Path:
    env = os.environ.get("GROWTHUB_REPO_ROOT", "").strip()
    if env:
        return Path(env).resolve()
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "--show-toplevel"],
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
        if out:
            return Path(out).resolve()
    except (OSError, subprocess.CalledProcessError):
        pass
    return Path.cwd().resolve()


def artifact_root(root: Path | None = None) -> Path:
    base = root if root is not None else repo_root()
    return (base / ".growthub" / "models").resolve()


def sanitize_model_id(model_id: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_.-]+", "__", model_id.replace("/", "--"))


def base_model_dir(root: Path, model_id: str) -> Path:
    return artifact_root(root) / "base" / sanitize_model_id(model_id)


def manifests_dir(root: Path) -> Path:
    d = artifact_root(root) / "manifests"
    d.mkdir(parents=True, exist_ok=True)
    return d
