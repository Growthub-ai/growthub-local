# Quickstart — Postiz Social + AEO Studio

**Kit:** `growthub-postiz-social-v1`  
**Worker:** `postiz-social-operator`  
**Upstream app:** [Postiz](https://github.com/gitroomhq/postiz-app) (AGPL-3.0)

---

## What you get

A self-contained **Markdown-first** workspace for:

- Multi-channel calendars and launch packs
- Channel mix and measurement readouts
- AEO/SEO **distribution** tie-ins (pillar URLs, UTMs) without replacing GEO audits
- Optional clone of Postiz for engineers validating APIs and env

---

## 1. Export the kit

```bash
growthub kit download growthub-postiz-social-v1
```

Point your agent working directory at the exported folder root.

---

## 2. Choose a mode

| Mode | When |
|---|---|
| `agent-only` | Fast planning — no Postiz clone |
| `local-fork` | You will run or inspect Postiz locally |
| `hybrid` | Fork on disk but schedules drafted offline |

---

## 3. Optional — clone Postiz

```bash
bash setup/clone-fork.sh
```

Defaults to `~/postiz-app` or `POSTIZ_FORK_PATH`.

Then follow https://docs.postiz.com/quickstart for PostgreSQL, Redis, and environment variables.

---

## 4. Verify tooling

```bash
node setup/verify-env.mjs
bash setup/check-deps.sh
```

---

## 5. Brand kit

```bash
cp brands/_template/brand-kit.md brands/<client-slug>/brand-kit.md
```

Fill channels, objectives, and compliance notes.

---

## 6. Run the operator

Open `workers/postiz-social-operator/CLAUDE.md` in your agent session and follow the workflow steps.

Artifacts land in `output/<client-slug>/<project-slug>/` per `output-standards.md`.

---

## Related kits

- **GEO / AI-search audits:** `growthub-geo-seo-v1`
- **Visual studio / Muapi:** `growthub-open-higgsfield-studio-v1`
