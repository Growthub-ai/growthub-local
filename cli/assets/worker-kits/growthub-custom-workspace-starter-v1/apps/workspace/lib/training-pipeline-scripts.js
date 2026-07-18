/**
 * Pipeline scripts the workspace PROVISIONS ITSELF — a user is never told to
 * "install" the pipeline's own files. The pre-init probe writes these into the
 * workspace (idempotent, only when absent) and verifies them; the training
 * runner then executes them as governed argv steps.
 *
 * Honesty contract: each script does REAL work when the substrate allows and
 * exits non-zero with a plain, specific reason when it does not (missing
 * python package, unknown base model, missing converter) — so a training run
 * stops at the exact stage with an honest receipt, never a fake success.
 */

/** Map an Ollama-style tag to a Hugging Face model id where the family is
 *  known; anything else is passed through as an HF id. ONE source of truth —
 *  injected into train.py / merge_and_export.py and used by the pre-init
 *  probe's base-weights blast-radius check. */
export const OLLAMA_TO_HF = {
  "gemma:2b": "google/gemma-2b-it",
  "gemma": "google/gemma-2b-it",
  "gemma:latest": "google/gemma-2b-it",
  "gemma2:2b": "google/gemma-2-2b-it",
  "gemma3:1b": "google/gemma-3-1b-it",
  "gemma3:4b": "google/gemma-3-4b-it",
  "gemma3": "google/gemma-3-4b-it",
  "qwen2.5-coder:7b": "Qwen/Qwen2.5-Coder-7B-Instruct",
  "llama3.2:3b": "meta-llama/Llama-3.2-3B-Instruct",
};

/** Resolve an Ollama-style tag to the HF id train.py will load. */
export function hfBaseIdFor(tag) {
  return OLLAMA_TO_HF[String(tag || "").trim()] || String(tag || "").trim();
}

/** Python packages the fine-tune/merge stages import — the pre-init probe
 *  ensures these are REALLY importable before Start Training can unlock. */
export const PYTHON_TRAINING_PACKAGES = ["torch", "transformers", "datasets", "peft", "trl"];

export const TRAIN_PY = `#!/usr/bin/env python3
"""Growthub local QLoRA fine-tune (provisioned by the workspace).

Reads a growthub-local-intelligence-trace JSONL dataset, LoRA-tunes the base
model, and writes the adapter to --out. Emits GH_PROGRESS lines the governed
runner streams into the live model-training-run receipt.
Exits non-zero with a plain reason when the substrate cannot train yet.
"""
import argparse, json, os, sys

OLLAMA_TO_HF = json.loads('''${JSON.stringify(OLLAMA_TO_HF)}''')

def gh(step, total, loss=None, checkpoint=None, note=None):
    p = {"step": step, "total": total}
    if loss is not None: p["loss"] = round(float(loss), 4)
    if checkpoint: p["checkpoint"] = checkpoint
    if note: p["note"] = note
    print("GH_PROGRESS " + json.dumps(p), flush=True)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", required=True)
    ap.add_argument("--base", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--epochs", type=float, default=1.0)
    a = ap.parse_args()

    rows = []
    with open(a.dataset) as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    if len(rows) < 10:
        print(f"Dataset too small: {len(rows)} rows (need 10+)", file=sys.stderr)
        sys.exit(2)
    total = len(rows)
    gh(0, total, note="dataset loaded")

    try:
        import torch
        from datasets import Dataset
        from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments, TrainerCallback
        from peft import LoraConfig, get_peft_model
        from trl import SFTTrainer, SFTConfig
    except ImportError as e:
        missing = getattr(e, "name", str(e))
        print(f"Python package '{missing}' is not installed. Fix: pip3 install torch transformers datasets peft trl", file=sys.stderr)
        sys.exit(2)

    hf_id = OLLAMA_TO_HF.get(a.base, a.base)
    gh(0, total, note=f"loading base model {hf_id}")
    try:
        tok = AutoTokenizer.from_pretrained(hf_id)
        model = AutoModelForCausalLM.from_pretrained(hf_id, torch_dtype="auto", low_cpu_mem_usage=True)
    except Exception as e:
        print(f"Could not load base model '{hf_id}': {str(e).splitlines()[0]}", file=sys.stderr)
        sys.exit(2)

    def to_text(r):
        return {"text": f"<start_of_turn>user\\n{r.get('instruction','')}\\n{r.get('input','')}<end_of_turn>\\n<start_of_turn>model\\n{r.get('output','')}<end_of_turn>\\n"}
    ds = Dataset.from_list([to_text(r) for r in rows])

    peft_cfg = LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05, task_type="CAUSAL_LM",
                          target_modules="all-linear")
    model = get_peft_model(model, peft_cfg)

    class GhCallback(TrainerCallback):
        def on_log(self, args, state, control, logs=None, **kw):
            if logs and state.max_steps:
                gh(state.global_step, state.max_steps, loss=logs.get("loss"))
        def on_save(self, args, state, control, **kw):
            gh(state.global_step, state.max_steps or total,
               checkpoint=os.path.join(args.output_dir, f"checkpoint-{state.global_step}"))

    cfg = SFTConfig(output_dir=a.out, num_train_epochs=a.epochs, per_device_train_batch_size=1,
                    gradient_accumulation_steps=4, logging_steps=1, save_steps=25,
                    report_to=[], use_cpu=not torch.cuda.is_available())
    trainer = SFTTrainer(model=model, train_dataset=ds, args=cfg, callbacks=[GhCallback()])
    trainer.train()
    trainer.save_model(a.out)
    tok.save_pretrained(a.out)
    gh(total, total, note="adapter saved")

if __name__ == "__main__":
    main()
`;

export const MERGE_AND_EXPORT_PY = `#!/usr/bin/env python3
"""Growthub adapter merge (provisioned by the workspace).

Merges the LoRA adapter from train.py back into the base model and writes the
merged full model to --out for GGUF conversion. Exits non-zero with a plain
reason when the substrate cannot merge yet.
"""
import argparse, json, sys

OLLAMA_TO_HF = json.loads('''${JSON.stringify(OLLAMA_TO_HF)}''')

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--adapter", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    try:
        from transformers import AutoModelForCausalLM, AutoTokenizer
        from peft import PeftModel
    except ImportError as e:
        missing = getattr(e, "name", str(e))
        print(f"Python package '{missing}' is not installed. Fix: pip3 install torch transformers peft", file=sys.stderr)
        sys.exit(2)
    hf_id = OLLAMA_TO_HF.get(a.base, a.base)
    try:
        model = AutoModelForCausalLM.from_pretrained(hf_id, torch_dtype="auto", low_cpu_mem_usage=True)
        tok = AutoTokenizer.from_pretrained(hf_id)
        merged = PeftModel.from_pretrained(model, a.adapter).merge_and_unload()
    except Exception as e:
        print(f"Merge failed for base '{hf_id}': {str(e).splitlines()[0]}", file=sys.stderr)
        sys.exit(2)
    merged.save_pretrained(a.out)
    tok.save_pretrained(a.out)
    print("MERGED", a.out)

if __name__ == "__main__":
    main()
`;

export const CONVERT_SHIM_PY = `#!/usr/bin/env python3
"""Growthub GGUF-converter shim (provisioned by the workspace).

Finds a real llama.cpp convert_hf_to_gguf.py on this machine (GGUF_CONVERTER
env, ./llama.cpp, or any /Volumes/*/llama.cpp checkout) and executes it with
the given arguments. Exits non-zero with a plain reason when none exists.
"""
import glob, os, subprocess, sys

def find_converter():
    env = os.environ.get("GGUF_CONVERTER", "")
    candidates = ([env] if env else []) + [
        os.path.join(os.getcwd(), "llama.cpp", "convert_hf_to_gguf.py"),
    ] + sorted(glob.glob("/Volumes/*/llama.cpp/convert_hf_to_gguf.py"))
    for c in candidates:
        if c and os.path.exists(c):
            return c
    return ""

conv = find_converter()
if not conv:
    print("No llama.cpp converter found on this machine (looked for convert_hf_to_gguf.py).", file=sys.stderr)
    sys.exit(2)
sys.exit(subprocess.call([sys.executable, conv, *sys.argv[1:]]))
`;

/** The files the probe provisions: name → content. */
export const PIPELINE_SCRIPTS = {
  "train.py": TRAIN_PY,
  "merge_and_export.py": MERGE_AND_EXPORT_PY,
  "convert_hf_to_gguf.py": CONVERT_SHIM_PY,
};
