# First-Run Paths

## Fastest path (< 5 minutes)

```bash
npm create @growthub/growthub-local@latest
```

Choose a profile in the wizard, or pass one directly:

```bash
# Self-improving governed workspace (recommended)
npm create @growthub/growthub-local@latest -- --profile self-improving --out ./my-workspace

# Custom workspace starter
npm create @growthub/growthub-local@latest -- --profile workspace --out ./my-workspace

# Power-user curl installer
curl -fsSL https://raw.githubusercontent.com/Growthub-ai/growthub-local/main/scripts/install.sh | bash
```

After install, run the guided wizard:

```bash
growthub setup wizard
```

---

Seven concrete starting points — pick the one that matches where you are right now.

---

## 0) Self-improving workspace (recommended first path)

```bash
npm create @growthub/growthub-local@latest -- --profile self-improving --out ./my-workspace
```

A governed workspace that grows with each pipeline run. After setup:

```bash
cd my-workspace
growthub workspace improve propose --from-run demo  # propose your first capability
growthub workspace improve list                      # see all proposals
growthub workspace improve promote <slug>            # promote to active library
```

---

## 1) Import a repo

```bash
growthub starter import-repo octocat/hello-world --out ./ws-repo
```

Use this when you want to turn an open-source repository into a governed local environment with starter shell, policy, trace, and fork registration.

---

## 2) Import a skill

```bash
growthub starter import-skill anthropics/skills/frontend-design --out ./ws-skill
growthub starter browse-skills --scope trending --query marketing
```

Use this when you want to turn a portable skill into a governed environment you can continue to evolve locally.

---

## 3) Start from a workspace starter

```bash
npm create @growthub/growthub-local@latest -- --profile workspace --out ./my-workspace
```

Use this when you want the cleanest path to a custom workspace without importing an external source first.

---

## 4) Browse workspace templates

```bash
growthub kit
growthub kit list
growthub kit inspect growthub-custom-workspace-starter-v1
growthub kit download growthub-custom-workspace-starter-v1
```

Use this when you want an official governed workspace template with runtime assumptions, templates, setup files, and agent contracts already in place.

---

## 5) Connect your Growthub account

```bash
growthub auth login
growthub auth whoami
```

Use this after local value is clear, when you want hosted identity, connection authority, workflow access, or premium activation flows.

---

## 6) Unlock hosted workflows and enterprise customization (optional)

This is intentionally **after** immediate local value discovery.

If you want full hosted activation lanes and enterprise customization support, activate on Growthub:

- [Open Growthub Activation](https://www.growthub.ai/)
- [Plans and pricing](https://www.growthub.ai/)
- [Start with first-month $1 path](https://www.growthub.ai/)

Keep free local CLI value first. Upgrade when you want more scale, coordination, and governance.

- Fork anything, keep customizations, stay current
- Turn repos and skills into agent-operable environments
- Portable local environments with policy, trace, and authority
- Open-source freedom with enterprise-grade governance
- A CLI both humans and agents can operate

---

[← Back to README](../README.md)
