# Open Higgsfield Fork Integration Notes

This document tells the agent what to inspect in a maintained local fork before it commits to a plan.

---

## EXPECTED REPO LAYOUT

Based on the upstream repository:

```text
app/
components/
electron/
packages/studio/src/
README.md
package.json
```

The agent should treat these as the runtime-critical zones:
- `packages/studio/src/models.js`
- `packages/studio/src/muapi.js`
- `packages/studio/src/components/*.jsx`
- `components/StandaloneShell.js`
- `components/ApiKeyModal.js`
- `electron/`

---

## WHAT TO INSPECT BEFORE GENERATING

1. Which studios are actually rendered in the current fork
2. Whether model ids or endpoint names differ from upstream
3. Which controls the UI exposes for the chosen model
4. Whether prompt is optional for the chosen mode
5. How many input images are supported
6. Whether upload history and generation history are available
7. Whether browser and desktop packaging diverge

---

## SOURCE OF TRUTH RULES

- `models.js` is the model source of truth
- `muapi.js` is the provider request-flow source of truth
- the relevant studio component is the UI behavior source of truth
- `README.md` is the environment and packaging overview
- `electron/` is the desktop-specific behavior source of truth

If these conflict, prefer:
1. studio component behavior
2. provider client behavior
3. model registry
4. README summary

---

## FORK-AWARE OUTPUT RULE

Every handoff should say whether it was:
- `fork-verified`
- `upstream-verified`
- `assumption-based`
