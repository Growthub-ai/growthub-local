# New Client — Onboarding

When the operator starts a new project:

1. Create `brands/<client-slug>/brand-kit.md` from the `_template` scaffold.
2. Fill in the Identity, Voice, Visual, Assets sections.
3. Append a `registered` event to `.growthub-fork/trace.jsonl` with `{clientSlug}` in the detail.
4. Run `growthub kit fork status <fork-id>` to confirm no drift was introduced.

The `_template/` brand is upstream-owned; all real client work lives under `brands/<client-slug>/`.
