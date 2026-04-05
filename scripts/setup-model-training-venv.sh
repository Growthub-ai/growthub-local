#!/usr/bin/env bash
set -euo pipefail

# Create a dedicated Python venv and install model-training dependencies.
# From repo root (same pattern as other bash entrypoints).

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MT="${ROOT}/packages/model-training"
VENV="${GROWTHUB_MODEL_VENV:-${MT}/.venv}"
WITH_UNSLOTH=false
WITH_VLLM=false
WITH_DISTILABEL=false

usage() {
  cat <<'EOF'
Usage:
  bash scripts/setup-model-training-venv.sh [--venv <path>] [--with-unsloth] [--with-vllm] [--with-distilabel]

Creates a Python venv and installs:
  - requirements-train-core.txt (HF, PEFT, TRL, …)
  - editable growthub-model-training package (or use pip install -e ".[train]" to sync extras from pyproject)

Optional bundles (may fail on macOS / without CUDA — use Linux+GPU for vLLM):
  --with-unsloth     Also install requirements-train-unsloth.txt (install PyTorch first)
  --with-vllm        Also install requirements-train-vllm.txt
  --with-distilabel  Also install requirements-train-distilabel.txt

Environment:
  GROWTHUB_MODEL_VENV   Override default venv path (${MT}/.venv)

After install, point the CLI at this interpreter:
  export GROWTHUB_PYTHON="${VENV}/bin/python3"
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --venv)
      VENV="${2:?}"
      shift 2
      ;;
    --with-unsloth)
      WITH_UNSLOTH=true
      shift
      ;;
    --with-vllm)
      WITH_VLLM=true
      shift
      ;;
    --with-distilabel)
      WITH_DISTILABEL=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

command -v python3 >/dev/null 2>&1 || {
  echo "ERROR: python3 not found" >&2
  exit 1
}

echo "Creating venv: ${VENV}"
python3 -m venv "${VENV}"
# shellcheck disable=SC1090
source "${VENV}/bin/activate"

python -m pip install -U pip wheel setuptools

echo "Installing training core requirements..."
python -m pip install -r "${MT}/requirements-train-core.txt"

echo "Installing editable growthub-model-training (package only; deps from core file)..."
python -m pip install -e "${MT}"

if [[ "${WITH_UNSLOTH}" == true ]]; then
  echo "Installing Unsloth stack (requires compatible PyTorch already in venv)..."
  python -m pip install -r "${MT}/requirements-train-unsloth.txt"
fi

if [[ "${WITH_DISTILABEL}" == true ]]; then
  echo "Installing distilabel bundle..."
  python -m pip install -r "${MT}/requirements-train-distilabel.txt"
fi

if [[ "${WITH_VLLM}" == true ]]; then
  echo "Installing vLLM (Linux+NVIDIA typical)..."
  python -m pip install -r "${MT}/requirements-train-vllm.txt"
fi

echo ""
echo "Done. Use:"
echo "  export GROWTHUB_PYTHON=${VENV}/bin/python3"
echo "Then from repo root: growthub model:bootstrap --dry-run"
