# growthub-model-training

Python orchestration for the **Growthub custom model** path: repo-root resolution, `.growthub/models/` layouts, versioned manifests, and CLI-spawned stages.

| What | Where |
|------|--------|
| OSS contracts | This package + `data/schemas/` |
| Weights, real JSONL, rewards | **Private** — never committed |

## 1) Create the training venv (installs real packages)

From the **growthub-local** repo root:

```bash
bash scripts/setup-model-training-venv.sh
```

Optional stacks (use when your machine matches upstream expectations; **vLLM is usually Linux + NVIDIA**):

```bash
bash scripts/setup-model-training-venv.sh --with-unsloth
bash scripts/setup-model-training-venv.sh --with-distilabel
bash scripts/setup-model-training-venv.sh --with-vllm
```

PyTorch: for GPU training/serving, install the **correct** `torch` build for your CUDA *before* or per [PyTorch](https://pytorch.org/get-started/locally/) and [Unsloth](https://github.com/unslothai/unsloth) docs. The setup script installs the **HF/PEFT core** first; Unsloth adds its stack on top.

**verl** is not pinned in `pip` here — clone and `pip install -e` from [verl-project/verl](https://github.com/verl-project/verl). See `requirements-train-verl.md`.

Point the Node CLI at this interpreter:

```bash
export GROWTHUB_PYTHON="$PWD/packages/model-training/.venv/bin/python3"
```

Default venv path: `packages/model-training/.venv` (override with `GROWTHUB_MODEL_VENV` or `--venv`).

## 2) Run stages

Via **growthub** (after `cli` is built and on `PATH`, or `pnpm --dir cli exec growthub`):

```bash
growthub model:bootstrap --dry-run
growthub model:bootstrap -- --download   # needs: pip install -e '.[hf]' or core venv + hf extra
```

Or directly:

```bash
source packages/model-training/.venv/bin/activate
export PYTHONPATH="$PWD/packages/model-training/src"
python3 -m growthub_model_training bootstrap --dry-run
```

## Requirements files

| File | Purpose |
|------|---------|
| `requirements-train-core.txt` | HF hub, transformers, TRL, PEFT, etc. |
| `requirements-train-unsloth.txt` | Core + Unsloth |
| `requirements-train-distilabel.txt` | Core + distilabel |
| `requirements-train-vllm.txt` | Core + vLLM |
| `requirements-train-verl.md` | Editable install from git |
