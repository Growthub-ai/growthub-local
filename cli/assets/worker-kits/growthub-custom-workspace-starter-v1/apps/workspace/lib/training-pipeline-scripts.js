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

export const DISTILL_STUDENT_PY = `#!/usr/bin/env python3
"""Growthub distillation student trainer (provisioned by the workspace).

Trains a student on harvested growthub-distillation-trace-v1 JSONL. When a
trace carries the teacher's reasoning it is folded into the target so the
student distills the teacher's chain, not just the final answer. --sparse
restricts LoRA modules to the top-k salient experts from a calibration
routing histogram (MoE-Sieve posture); non-MoE bases fall back to dense with
an honest note. Emits the same GH_PROGRESS lines the governed runner streams.
"""
import argparse, json, os, sys

def gh(step, total, loss=None, note=None):
    p = {"step": step, "total": total}
    if loss is not None: p["loss"] = round(float(loss), 4)
    if note: p["note"] = note
    print("GH_PROGRESS " + json.dumps(p), flush=True)

def load_traces(path):
    rows = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows

def to_text(r):
    prompt = r.get("prompt", r.get("instruction", ""))
    reasoning = r.get("reasoning", "")
    response = r.get("response", r.get("output", ""))
    target = (f"<thinking>{reasoning}</thinking>\\n{response}" if reasoning else response)
    return {"text": f"<start_of_turn>user\\n{prompt}<end_of_turn>\\n<start_of_turn>model\\n{target}<end_of_turn>\\n"}

def salient_modules(histogram_path, top_k):
    """Top-k expert module name fragments per layer from the calibration histogram."""
    with open(histogram_path) as f:
        hist = json.load(f)
    frags = []
    for layer in hist.get("layers", []):
        ranked = sorted(layer.get("counts", {}).items(), key=lambda kv: -kv[1])[:top_k]
        for expert_id, _ in ranked:
            frags.append(f"layers.{layer.get('layer', 0)}.mlp.experts.{expert_id}")
    return frags

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", required=True)
    ap.add_argument("--base")
    ap.add_argument("--teacher", default="")
    ap.add_argument("--out")
    ap.add_argument("--curate-only", action="store_true")
    ap.add_argument("--sparse", action="store_true")
    ap.add_argument("--routing-histogram", default="")
    ap.add_argument("--expert-top-k", type=int, default=8)
    a = ap.parse_args()

    rows = [r for r in load_traces(a.dataset) if (r.get("prompt") or r.get("instruction"))]
    if a.curate_only:
        kept = [r for r in rows if float(r.get("score", 0)) >= 4 or r.get("output") or r.get("response")]
        os.makedirs(a.out or ".", exist_ok=True)
        out_path = os.path.join(a.out or ".", "curated.jsonl")
        with open(out_path, "w") as f:
            for r in kept:
                f.write(json.dumps(r) + "\\n")
        gh(len(kept), len(rows), note=f"curated {len(kept)}/{len(rows)} traces -> {out_path}")
        return
    if len(rows) < 10:
        print(f"Corpus too small: {len(rows)} traces (need 10+)", file=sys.stderr)
        sys.exit(2)
    total = len(rows)
    gh(0, total, note="corpus loaded")

    try:
        import torch
        from datasets import Dataset
        from transformers import AutoModelForCausalLM, AutoTokenizer, TrainerCallback
        from peft import LoraConfig, get_peft_model
        from trl import SFTTrainer, SFTConfig
    except ImportError as e:
        missing = getattr(e, "name", str(e))
        print(f"Python package '{missing}' is not installed. Fix: pip3 install torch transformers datasets peft trl", file=sys.stderr)
        sys.exit(2)

    gh(0, total, note=f"loading base model {a.base}")
    try:
        tok = AutoTokenizer.from_pretrained(a.base)
        model = AutoModelForCausalLM.from_pretrained(a.base, torch_dtype="auto", low_cpu_mem_usage=True)
    except Exception as e:
        print(f"Could not load base model '{a.base}': {str(e).splitlines()[0]}", file=sys.stderr)
        sys.exit(2)

    target_modules = "all-linear"
    if a.sparse and a.routing_histogram and os.path.exists(a.routing_histogram):
        frags = salient_modules(a.routing_histogram, a.expert_top_k)
        named = [n for n, _ in model.named_modules() if any(f in n for f in frags)]
        if named:
            target_modules = named
            gh(0, total, note=f"sparse path: adapting {len(named)} salient expert modules (top-{a.expert_top_k})")
        else:
            gh(0, total, note="no MoE expert modules matched the histogram - training dense (honest fallback)")

    model = get_peft_model(model, LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05,
                                             task_type="CAUSAL_LM", target_modules=target_modules))
    ds = Dataset.from_list([to_text(r) for r in rows])

    class GhCallback(TrainerCallback):
        def on_log(self, args, state, control, logs=None, **kw):
            if logs and state.max_steps:
                gh(state.global_step, state.max_steps, loss=logs.get("loss"))

    cfg = SFTConfig(output_dir=a.out, num_train_epochs=1.0, per_device_train_batch_size=1,
                    gradient_accumulation_steps=4, logging_steps=1, save_steps=25,
                    report_to=[], use_cpu=not torch.cuda.is_available())
    trainer = SFTTrainer(model=model, train_dataset=ds, args=cfg, callbacks=[GhCallback()])
    trainer.train()
    trainer.save_model(a.out)
    tok.save_pretrained(a.out)
    meta = {"teacher": a.teacher, "sparse": bool(a.sparse), "expert_top_k": a.expert_top_k, "traces": total}
    with open(os.path.join(a.out, "distillation.json"), "w") as f:
        json.dump(meta, f)
    gh(total, total, note="student adapter saved")

if __name__ == "__main__":
    main()
`;

export const CALIBRATE_ROUTING_PY = `#!/usr/bin/env python3
"""Growthub sparse-MoE routing calibration (provisioned by the workspace).

Runs a forward pass over the trace corpus with router logits enabled and
writes the expert routing histogram JSON ({"moe": bool, "layers": [...]}) the
sparse student trainer and the receipt's operator proof consume. A non-MoE
base writes an honest empty histogram instead of pretending.
"""
import argparse, json, sys

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", required=True)
    ap.add_argument("--base", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--max-traces", type=int, default=64)
    a = ap.parse_args()

    rows = []
    with open(a.dataset) as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    rows = rows[: a.max_traces]
    if not rows:
        print("No traces to calibrate on", file=sys.stderr)
        sys.exit(2)

    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
    except ImportError as e:
        missing = getattr(e, "name", str(e))
        print(f"Python package '{missing}' is not installed. Fix: pip3 install torch transformers", file=sys.stderr)
        sys.exit(2)

    tok = AutoTokenizer.from_pretrained(a.base)
    model = AutoModelForCausalLM.from_pretrained(a.base, torch_dtype="auto", low_cpu_mem_usage=True)
    model.eval()

    counts = {}
    moe = False
    with torch.no_grad():
        for i, r in enumerate(rows):
            text = str(r.get("prompt", ""))[:2048]
            if not text:
                continue
            inputs = tok(text, return_tensors="pt", truncation=True, max_length=512)
            try:
                out = model(**inputs, output_router_logits=True)
                router_logits = getattr(out, "router_logits", None)
            except TypeError:
                router_logits = None
            if router_logits:
                moe = True
                for layer_idx, logits in enumerate(router_logits):
                    top = logits.argmax(dim=-1).flatten().tolist()
                    layer = counts.setdefault(layer_idx, {})
                    for expert in top:
                        layer[str(expert)] = layer.get(str(expert), 0) + 1
            print("GH_PROGRESS " + json.dumps({"step": i + 1, "total": len(rows)}), flush=True)

    histogram = {"moe": moe, "layers": [{"layer": k, "counts": v} for k, v in sorted(counts.items())]}
    with open(a.out, "w") as f:
        json.dump(histogram, f)
    print("GH_PROGRESS " + json.dumps({"step": len(rows), "total": len(rows),
          "note": ("routing histogram written" if moe else "base has no MoE router - histogram empty (dense path applies)")}), flush=True)

if __name__ == "__main__":
    main()
`;

export const EXTRACT_DELTA_PY = `#!/usr/bin/env python3
"""Growthub adapter delta extractor (provisioned by the workspace).

The LoRA adapter IS the delta ("nudges only"); this step establishes its
identity: copies the adapter to --out, measures its bytes vs the merged
model, and writes delta-metrics.json (sha256 + sizes) for the receipt's
distillation.delta proof.
"""
import argparse, hashlib, json, os, shutil, sys

def dir_bytes(path):
    total = 0
    for root, _, files in os.walk(path):
        for name in files:
            total += os.path.getsize(os.path.join(root, name))
    return total

def dir_sha256(path):
    h = hashlib.sha256()
    for root, _, files in os.walk(path):
        for name in sorted(files):
            fp = os.path.join(root, name)
            h.update(name.encode())
            with open(fp, "rb") as f:
                for chunk in iter(lambda: f.read(1 << 20), b""):
                    h.update(chunk)
    return h.hexdigest()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--adapter", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--merged", default="")
    a = ap.parse_args()

    if not os.path.isdir(a.adapter):
        print(f"Adapter dir not found: {a.adapter}", file=sys.stderr)
        sys.exit(2)
    if os.path.abspath(a.out) != os.path.abspath(a.adapter):
        shutil.copytree(a.adapter, a.out, dirs_exist_ok=True)
    delta_bytes = dir_bytes(a.out)
    full_bytes = dir_bytes(a.merged) if a.merged and os.path.isdir(a.merged) else 0
    metrics = {"path": a.out, "sha256": dir_sha256(a.out),
               "deltaBytes": delta_bytes, "fullFineTuneBytes": full_bytes}
    with open(os.path.join(a.out, "delta-metrics.json"), "w") as f:
        json.dump(metrics, f)
    print("GH_PROGRESS " + json.dumps({"step": 1, "total": 1,
          "note": f"delta {delta_bytes} bytes" + (f" vs full {full_bytes} bytes" if full_bytes else "")}), flush=True)

if __name__ == "__main__":
    main()
`;

/** The files the probe provisions: name → content. */
export const PIPELINE_SCRIPTS = {
  "train.py": TRAIN_PY,
  "merge_and_export.py": MERGE_AND_EXPORT_PY,
  "convert_hf_to_gguf.py": CONVERT_SHIM_PY,
  "distill_student.py": DISTILL_STUDENT_PY,
  "calibrate_routing.py": CALIBRATE_ROUTING_PY,
  "extract_delta.py": EXTRACT_DELTA_PY,
};
