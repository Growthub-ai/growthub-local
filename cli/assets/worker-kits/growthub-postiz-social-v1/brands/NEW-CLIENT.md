# New Client Brand Kit Setup

Add a client to the Postiz Social + AEO Studio.

---

## Step 1 — Copy the template

```bash
cp brands/_template/brand-kit.md brands/<client-slug>/brand-kit.md
```

---

## Step 2 — Required fields

| Field | Why |
|---|---|
| `client_name`, `slug` | Output paths and titles |
| `primary_channels` | Drives channel mix and launch pack tables |
| `calendar_objective` | North star for calendar templates |
| `pillar_urls` | AEO/SEO linkage for social clips |
| `messaging_guardrails` | Compliance and tone |
| `postiz_workspace_notes` | Maps brands to Postiz workspaces once live |

---

## Step 3 — Create output folder

```bash
mkdir -p output/<client-slug>/<project-slug>
```

---

## Step 4 — Optional Postiz fork

```bash
bash setup/clone-fork.sh
```

Configure database and env per https://docs.postiz.com/quickstart before claiming live scheduling behavior.
