# Hyperframes Studio Quickstart

## 1) Prepare environment

```bash
cp .env.example .env
bash setup/check-deps.sh
node setup/verify-env.mjs
```

## 2) Clone Hyperframes locally

```bash
bash setup/clone-fork.sh
```

## 3) Start work

- Point your agent Working Directory to this exported folder.
- Follow `workers/hyperframes-studio-operator/CLAUDE.md`.
- Write outputs to `output/<client-slug>/<project-slug>/`.
