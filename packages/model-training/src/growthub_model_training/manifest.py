from __future__ import annotations

import json
import subprocess
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass
class GrowthubModelManifestV1:
    """Versioned artifact manifest (JSON-serializable)."""

    schema_version: int = 1
    created: str = ""
    repo_git_sha: str | None = None
    base_model_id: str = ""
    hf_revision: str | None = None
    artifact_root: str = ""
    stages: dict[str, Any] = field(default_factory=dict)
    notes: str | None = None

    def __post_init__(self) -> None:
        if not self.created:
            self.created = datetime.now(timezone.utc).isoformat()

    def to_json_dict(self) -> dict[str, Any]:
        return asdict(self)


def current_repo_git_sha(root: Path) -> str | None:
    try:
        out = subprocess.check_output(
            ["git", "-C", str(root), "rev-parse", "HEAD"],
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
        return out or None
    except (OSError, subprocess.CalledProcessError):
        return None


def write_manifest(path: Path, manifest: GrowthubModelManifestV1) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest.to_json_dict(), indent=2) + "\n", encoding="utf8")


def read_manifest(path: Path) -> GrowthubModelManifestV1 | None:
    if not path.is_file():
        return None
    data = json.loads(path.read_text(encoding="utf8"))
    if data.get("schema_version") != 1:
        return None
    return GrowthubModelManifestV1(
        schema_version=int(data["schema_version"]),
        created=str(data.get("created", "")),
        repo_git_sha=data.get("repo_git_sha"),
        base_model_id=str(data.get("base_model_id", "")),
        hf_revision=data.get("hf_revision"),
        artifact_root=str(data.get("artifact_root", "")),
        stages=dict(data.get("stages") or {}),
        notes=data.get("notes"),
    )
