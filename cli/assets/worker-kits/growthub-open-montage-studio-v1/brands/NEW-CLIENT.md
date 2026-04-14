# Creating a Brand Kit for a New Client

## Steps

1. Copy the template:

```bash
cp -r brands/_template brands/<client-slug>
```

2. Open `brands/<client-slug>/brand-kit.md` and fill in:
   - Brand identity (name, tagline, industry, audience)
   - Visual identity (colors, fonts, logo)
   - Tone of voice
   - Visual style preferences
   - Platform profiles
   - Music preferences

3. The operator loads this brand kit in Step 1 of every session. All production artifacts will reference these brand guidelines.

## Naming Convention

- Use kebab-case for the client slug: `acme-corp`, `startup-xyz`
- Keep the slug short and recognizable

## What Goes in a Brand Kit

| Section | Required | Purpose |
|---|---|---|
| Brand identity | Yes | Who they are and who they serve |
| Visual identity | Yes | Colors, fonts, logo for consistent output |
| Tone of voice | Yes | How to write scripts and narration |
| Visual style preferences | Yes | Which visual treatment to use |
| Platform profiles | Recommended | Target platforms and format constraints |
| Music preferences | Recommended | Audio direction for background music |
| Deliverable log | Auto-populated | Running record of all produced content |

## Tips

- If the client has a website or existing video content, reference it in the brand kit for style alignment
- Color values should be hex codes for precision
- If unsure about visual style, default to "clean professional" and note it for client review
