# verl (GRPO / RLHF)

`verl` is usually installed from a **git clone** of the maintained repo (layout and extras change often):

```bash
git clone https://github.com/verl-project/verl.git ../verl-project-verl
cd ../verl-project-verl
pip install -e .
```

Use a **separate venv** if `verl` and `vllm` pin conflicting dependencies. Point `growthub` at that interpreter with `GROWTHUB_PYTHON`.
