# New Client — Onboarding

When the operator starts a new project:

1. Create `brands/<client-slug>/brand-kit.md` from the `_template` scaffold.
2. Fill in all YAML fields — Identity, Audience, Messaging, Brand Design, Talent, Assets, Platform.
3. Create `brands/<client-slug>/assets/` for logo and reference images.
4. Append a `registered` event to `.growthub-fork/trace.jsonl` with `{clientSlug}` in the detail.
5. Run `growthub kit fork status <fork-id>` to confirm no drift was introduced.

The `_template/` brand is upstream-owned; all real client work lives under `brands/<client-slug>/`.

## Quick scaffold

```bash
SLUG=<client-slug>
cp brands/_template/brand-kit.md brands/${SLUG}/brand-kit.md
mkdir -p brands/${SLUG}/assets
```

Fill every field. Use "N/A" or "TBD" if unknown — do not delete keys.
