from __future__ import annotations

import sys

from . import bootstrap

_STAGES: dict[str, str] = {
    "train": "Unsloth / Axolotl: supervised fine-tuning (see packages/model-training/README.md).",
    "eval": "Run eval harness against merged or adapter weights.",
    "distill": "distilabel: teacher-student and synthetic preference generation (private teacher endpoint).",
    "merge": "Merge LoRA into base checkpoint for serving.",
    "quantize": "GGUF / AWQ export using your pinned quant toolkit.",
    "deploy": "vLLM: print `vllm serve ...` from manifest paths (OpenAI-compatible API).",
    "preference": "DPO / SimPO / ORPO (Unsloth or Axolotl YAML).",
    "grpo": "verl: GRPO with verifiable reward subprocess (scripts/pr-ready.sh, guard tools).",
}


def main(argv: list[str] | None = None) -> None:
    args = argv if argv is not None else sys.argv[1:]
    if not args:
        print("Usage: python -m growthub_model_training <bootstrap|train|eval|...>", file=sys.stderr)
        sys.exit(1)
    cmd = args[0]
    rest = args[1:]
    if cmd == "bootstrap":
        raise SystemExit(bootstrap.run(rest))
    if cmd in _STAGES:
        from .stages import run_stage

        raise SystemExit(run_stage(rest, cmd, _STAGES[cmd]))
    print(f"Unknown command: {cmd}", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
