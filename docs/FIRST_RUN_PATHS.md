# First-Run Paths

Six concrete starting points — pick the one that matches where you are right now.

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

## 4) Download a worker kit

```bash
growthub kit
growthub kit list
growthub kit inspect <kit-id>
growthub kit download <kit-id>
```

Use this when you want a prepackaged environment with runtime assumptions, templates, setup files, and agent contract already in place.

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
