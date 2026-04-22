# Creative Strategist Worker Skill
## Video Creative Brief Production  |  Multi-Brand System

> **Who this is for:** Any agent (Claude is first-party; Cursor / Codex / Gemini / custom harnesses are equally supported) operating inside `${CREATIVE_STRATEGIST_HOME:-$HOME/creative-strategist}/` and producing a Video Creative Brief.
> Read this file fully before starting. Every section is a required step.
>
> **Workspace path:** all commands below reference the kit workspace via the `CREATIVE_STRATEGIST_HOME` env var. Default: `$HOME/creative-strategist`. Override it to any directory (e.g. `export CREATIVE_STRATEGIST_HOME=$HOME/claude-workers`) to mount your own brand/template tree without forking this kit.

---

## QUICK REFERENCE

| What you need | Where to find it |
|---|---|
| This workflow | `skills.md` ← you are here |
| **Ad format library** | `templates/ad-formats/INDEX.md` ← check FIRST on every brief |
| **Scene module library** | `templates/scene-modules/INDEX.md` |
| **Frame analysis (new muse)** | `templates/ad-formats/frame-analysis.md` — load only if no frozen format matches |
| Client brand kits | `brands/<client-slug>/brand-kit.md` |
| Blank brand kit template | `brands/_template/brand-kit.md` |
| Brief JS template | `templates/brief-template.js` |
| Output location | `~/Downloads/<ClientSlug>_VideoBrief_<Concept>_v<N>_<YYYYMMDD>.docx` |
| Work directory | `/tmp/docx_work/` — run `npm install docx` here once per session |
| Muse frames dir | `/tmp/muse_frames/` — check before running ffmpeg |
| **500 Hooks CSV** | `templates/hooks-library/500-winning-hooks.csv` ← grep for Scene 1 hooks (Step 2d) |
| Example (TheraPet → ODRx) | `~/Downloads/Clarifion_ODRx_VideoBrief_TheraPetAI_v1_20260408.docx` |
| Example (Solawave BOGO) | `~/Downloads/Solawave_VideoBrief_KoreanSkincaretruth_v1_20260409.docx` |
| Example (AllCore360° CGI) | `~/Downloads/AllCore360_VideoBrief_CGIGravityHook_v1_20260409.docx` |

---

## STEP 0 — UNDERSTAND THE TASK

Answer these four questions before writing anything:

1. **Who is the client?** → Find or create `brands/<slug>/brand-kit.md`
2. **What is the one video creative?** → Single ad concept, not multiple separate ads
3. **How many hook variations?** → Default 5 (A–E)
4. **What is strictly forbidden?** → Check `messaging_guardrails` in the brand kit

---

## STEP 1a — CREATE BRAND KIT (new client only)

```bash
cp brands/_template/brand-kit.md brands/<client-slug>/brand-kit.md
mkdir -p brands/<client-slug>/assets
```

Required fields: `client_name`, `slug`, `primary_service`, `landing_page`, `target_audience`,
`tone`, `colors` (hex), `messaging_guardrails`, `do_not_attract`.

---

## STEP 1b — READ THE BRAND KIT

```bash
cat ${CREATIVE_STRATEGIST_HOME:-$HOME/creative-strategist}/brands/<client-slug>/brand-kit.md
```

Load every field. The brief JS must pull colors, tone, and guardrails from this file — not memory.

---

## STEP 2 — CONFIRM BRIEF INPUTS

```
Length:                  [XX seconds]
Format:                  [UGC / Doctor-Led / Explainer / Performance / etc.]
Primary Goal:            [Conversion / Awareness / Education / Trust-Building]
Voiceover:               [who speaks + role]
Tone:                    [3–5 adjectives from brand kit]
AI Avatar Required:      [Yes/No] → Type: [Photoreal / Talking Head / UGC]
Voiceover Setup:         [VO only / UGC dialogue / founder VO / AI VO]
Voice Type:              [Gender | Age | Tone | Accent]
UGC Asset Requirements:  [Yes/No] → folder link or creator reference
Brand Image Availability:[Air.inc / Drive / Instagram / Website]
Video References:        [inspiration links or "None provided"]
Hook Variations:         [default 5 — A through E]
Scene Count:             [default 4 — Hook / Problem / Transformation / CTA]
B-Roll Cadence:          [e.g. "cut every ~3 seconds"]
CTA Offer:               [specific offer text]
Phone + Website:         [from brand kit]
```

---

## STEP 2c — CHECK TEMPLATE LIBRARY (BEFORE any frame extraction)

> **Do this first — every time.** A frozen format skips frame extraction entirely.

```
Read ${CREATIVE_STRATEGIST_HOME:-$HOME/creative-strategist}/templates/ad-formats/INDEX.md
```

**Match found?**
- Yes → `Read templates/ad-formats/<matched-id>.md`
  Load the format's scene structure + scene modules. Replace `[PLACEHOLDERS]` from brand-kit.md.
  Do NOT re-extract frames. The format file is the frozen scene map.
- No → proceed to Step 2b.

**Then load scene modules:**
```
Read ${CREATIVE_STRATEGIST_HOME:-$HOME/creative-strategist}/templates/scene-modules/INDEX.md
```
Pull each module listed under "Scene Modules Used" in the format file.

**After completing a new muse brief → freeze the format:**
```
Create templates/ad-formats/<new-id>.md   (copy any existing format file as schema)
Add row to templates/ad-formats/INDEX.md
Add reusable scenes to templates/scene-modules/
Add rows to templates/scene-modules/INDEX.md
```

---

## STEP 2d — HOOK SELECTION FROM FROZEN CSV

> Run this every brief — before writing any Scene 1 hook variation.
> CSV: `templates/hooks-library/500-winning-hooks.csv`
> Columns: `Example` (real hook) | `Structure` (template with `[PLACEHOLDERS]`)
> **Always adapt the Structure column** — not the Example. Structure has the swap-ready pattern.

**3-pass grep method (fast):**

```bash
CSV=${CREATIVE_STRATEGIST_HOME:-$HOME/creative-strategist}/templates/hooks-library/500-winning-hooks.csv

# Pass 1 — client niche / pain-point keywords
grep -i "KEYWORD1\|KEYWORD2" "$CSV" | head -10

# Pass 2 — hook type (pick the types relevant to the brief)
grep -i "save this\|stop using\|nobody.*talking\|doesn't want\|going missing\|ugly truth\|hard pill\|mistake\|secret" "$CSV" | head -15

# Pass 3 — structured output: show Example + Structure side-by-side for top matches
python3 - "$CSV" "KEYWORD" << 'PY'
import csv, sys
path, kw = sys.argv[1], sys.argv[2].lower()
with open(path) as f:
    for i, row in enumerate(csv.reader(f)):
        if len(row) >= 2 and (kw in row[0].lower() or kw in row[1].lower()):
            print(f"[{i}] EXAMPLE:   {row[0][:90]}")
            print(f"    STRUCTURE: {row[1][:100]}\n")
PY
```

**Selection rules:**
1. Pick the 5 most relevant matches — one per hook variation (A–E)
2. Swap `[PLACEHOLDERS]` from `brand-kit.md` → `primary_service`, `tone`, `approved_phrases`
3. Log the CSV row index next to each hook in the brief (for reproducibility)
4. If <3 strong matches found → broaden Pass 1 keywords, then fall back to Pass 2 types

**Hook type → brief slot mapping:**

| Hook Type | Best Slot | Trigger Keyword to grep |
|-----------|-----------|------------------------|
| Industry suppression | Hook A (disruption) | `doesn't want\|going missing` |
| Nobody's talking | Hook B (blind spot) | `nobody.*talking\|no one.*talking` |
| Save this video | Hook C (urgency) | `save this` |
| Stop using X | Hook D (contrast) | `stop using\|stop doing` |
| Ugly truth / hard pill | Hook E (controversy) | `ugly truth\|hard pill` |
| Results in time frame | Any | `in \d+ days\|in \d+ minutes` |
| Mistake warning | Any | `mistake\|wrong` |
| Story / gather round | Narrative opener | `story\|gather` |

---

## STEP 2b — MUSE VIDEO ANALYSIS (only when no frozen format exists)

> Full methodology → `templates/ad-formats/frame-analysis.md`
> The commands below are the minimum to run. Read frame-analysis.md for the complete
> scene map format, adaptation hierarchy, ↑ mirrors notation, and freeze checklist.

```bash
# 1. Check if frames already exist
ls /tmp/muse_frames/ 2>/dev/null | head -5

# 2. Get video runtime
ffprobe -v quiet -print_format json -show_format -show_streams "/path/to/video.mp4" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); \
    [print(s.get('duration','?'),'sec |',s.get('width','?'),'x',s.get('height','?')) \
    for s in d['streams'] if s.get('codec_type')=='video']"

# 3. Extract frames (3s intervals for 60–120s video; 2s for <30s TikTok format)
mkdir -p /tmp/muse_frames
ffmpeg -i "/path/to/video.mp4" -vf fps=1/3 /tmp/muse_frames/frame_%ds.jpg 2>&1 | tail -3
ls /tmp/muse_frames/ | sort
```

**Read every frame** using the Read tool — batch 3 per call. Before writing the brief, answer:
- How many distinct scenes?
- Where is the tone flip (problem → solution)?
- What is the character/visual format?
- What is the text rhythm (karaoke? sentences?)?

**Non-negotiable rule:** If the muse has 9 scenes, the brief has 9 scenes. Always.

---

## STEP 3 — DOCUMENT STRUCTURE

Every brief follows this exact section order. No additions, no skips.

```
TITLE BLOCK          — client name, campaign, date, "1 Video | N Hook Variations"
BRAND CONSTRAINT BOX — warning callout: what this ad must NEVER say or do
BRIEF OVERVIEW TABLE — all Step 2 fields as key-value table
0. MUSE MAPPING TABLE — (muse-based briefs only) scene-by-scene comparison
1. CORE AD CONCEPT   — 2–3 paragraph narrative + emotional arc + concept KV table
2. STRUCTURE & VO    — Scene 1 hook window + N hook cards + Scenes 2–N scene blocks
3. EDITING GUIDELINES— pacing, color grade, music, captions, NO-list, aspect ratios
--- PAGE BREAK ---
APPENDIX             — AI video generation prompts (Veo 3 / Runway) — labeled OPTIONAL
```

---

## STEP 4 — GENERATE THE DOCX

```bash
# Copy and fill the template
cp ${CREATIVE_STRATEGIST_HOME:-$HOME/creative-strategist}/templates/brief-template.js /tmp/docx_work/<slug>_brief_v1.js
# Edit: fill CONFIG (colors from brand kit) + BRIEF (all content)

# Run
cd /tmp/docx_work && npm install docx   # once per session
node <slug>_brief_v1.js
# Output: $HOME/Downloads/<slug>_VideoBrief_<concept>_v1_<YYYYMMDD>.docx
```

**JS non-negotiables:**
- Page: US Letter — `width:12240, height:15840` — margins `1440` all sides — content width = 9360 DXA
- Font: Arial. Arial Unicode MS for cells with `—`, `|`, `≤`
- Table widths: always `WidthType.DXA` — never `WidthType.PERCENTAGE`
- Cell widths must sum to table width (9360)
- Shading: always `ShadingType.CLEAR`
- Bullets: indent + TextRun bullet character — never `LevelFormat.BULLET`
- Never `\n` inside a TextRun — use separate `Paragraph` elements
- Hyperlinks: always `ExternalHyperlink` — never plain text for clickable URLs

---

## STEP 5 — OPEN IN GOOGLE DOCS

```bash
open -R "$HOME/Downloads/<filename>.docx"
osascript -e 'tell application "Google Chrome" to open location "https://drive.google.com/drive/my-drive"'
```

Tell the user: "File revealed in Finder. Drag into the Google Drive browser window, then right-click → Open with → Google Docs."

---

## STEP 6 — LOG TO BRAND KIT

```bash
echo "- $(date +%Y-%m-%d) | Video Creative Brief v1 | ~/Downloads/<filename>.docx" \
  >> ${CREATIVE_STRATEGIST_HOME:-$HOME/creative-strategist}/brands/<client-slug>/brand-kit.md
```

---

## DESIGN SYSTEM (JS components)

Change only the 6 color constants at the top of the JS file — pull from `brand-kit.md → colors`.

| Function | Description |
|---|---|
| `h2(text)` | Full-width colored bar — section heading (`HeadingLevel.HEADING_2` inside cell) |
| `h3(text)` | Left accent stripe — sub-heading (`HeadingLevel.HEADING_3`) |
| `hyperlink(txt,url)` | External hyperlink — for muse URLs, LP URLs, references |
| `kvTable(rows)` | Key-value info table (2 col, alternating shading) |
| `sceneBlock(...)` | Scene card: colored header + label/content rows |
| `hookCard(...)` | Hook variation card: accent left stripe + content block |
| `alertBox(text)` | Warning/constraint callout box |
| `bullet(text)` | Brand-colored bullet point |
| `sp(pts)` | Vertical spacer paragraph |

---

## GUARDRAILS — EVERY BRIEF

1. One creative per brief — not multiple separate ads
2. N hook variations in Scene 1 only — Scenes 2–N identical across all
3. AI/Veo prompts in Appendix only — never inline in scene blocks
4. Appendix labeled OPTIONAL
5. No pharmaceutical/clinical language unless client is explicitly pharma
6. Brand constraint alert box always present — immediately after title block
7. Aspect ratios: 9:16 + 1:1 minimum. Add 16:9 if YouTube in scope.
8. Captions ON by default
9. Date the document — version + date in filename and title block

---

## COMMON MISTAKES

| Mistake | Correct Approach |
|---|---|
| Writing 5 separate creatives | 1 creative + 5 hook variations in Scene 1 |
| Veo prompts inline in scenes | All AI prompts → Appendix, labeled OPTIONAL |
| `WidthType.PERCENTAGE` in tables | Always `WidthType.DXA` |
| `\n` inside TextRun | Separate Paragraph elements |
| Skipping brand constraint box | Always include — it's the most important element |
| Generic tone language | Pull exact adjectives from brand-kit.md |
| Missing actor age/type spec | Always specify: age range + look + warmth |
| Vague CTA | Always include: website + specific offer text |
| Ignoring muse scene count | Muse has 9 scenes → brief has 9 scenes. Always. |
| Skipping the template library | Check `templates/ad-formats/INDEX.md` FIRST — every session |
| Writing scene modules from memory | Pull from `templates/scene-modules/` — JS stubs + AI prompts pre-built |
| Not freezing after a new muse brief | After every new muse → freeze in `templates/ad-formats/` |

---

## FOLDER STRUCTURE

```
${CREATIVE_STRATEGIST_HOME:-$HOME/creative-strategist}/
├── skills.md                          ← this file — read first, every session
├── README.md                          ← kit overview + template library summary
├── templates/
│   ├── brief-template.js              ← base JS (copy per client)
│   ├── hooks-library/
│   │   └── 500-winning-hooks.csv      ← frozen hook database — grep in Step 2d (538 rows)
│   ├── ad-formats/
│   │   ├── INDEX.md                   ← frozen format lookup — check before Step 2b
│   │   ├── bedroom-minimic-talk.md    ← @frankyshaw 23s format (Solawave)
│   │   ├── villain-animation.md       ← TheraPet 98s format (Clarifion ODRx)
│   │   └── frame-analysis.md         ← full frame extraction methodology (new muses only)
│   └── scene-modules/
│       ├── INDEX.md                   ← module lookup + assembly recipes
│       ├── hooks/                     ← meme-overlay, tiktok-comment, pov-confession,
│       │                                 dollar-amount, villain-hook
│       ├── body/                      ← minimic-problem, tiktok-skeptic-pivot,
│       │                                 product-demo-glow, villain-agitation, before-after-flatlay
│       └── cta/                       ← bogo-meme-bookend, guarantee-close
└── brands/
    ├── _template/brand-kit.md
    ├── solawave/brand-kit.md
    ├── clarifion/brand-kit.md
    ├── greentree-medical-center/brand-kit.md
    └── annie-appleseed-project/brand-kit.md
```
