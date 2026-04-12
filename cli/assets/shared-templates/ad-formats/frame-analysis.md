# Frame-by-Frame Video Analysis — Full Methodology
> **Load this file only when:** a muse video is provided AND no frozen format matches in `INDEX.md`.
> **Skip this file when:** a matching format exists in `INDEX.md` — use the format file instead.
>
> Source of truth: proven on Clarifion ODRx brief (April 2026), TheraPet muse → 9-scene match.

---

## WHY THIS MATTERS

A muse video is not a reference for "tone and feel." It is a **performance-proven creative structure**.
When a user says "use this as the muse," they mean:
- Same number of scenes — same types in the same order
- Same visual character format (villain objects, product characters, UGC creator, etc.)
- Same karaoke text rhythm and placement
- Same emotional arc (where the tone shifts from problem → solution)
- Same CTA structure

Writing a brief based on vibes from the muse = wrong. Reverse engineering frame by frame = right.

---

## PHASE 1: VIDEO INGESTION

```bash
# Get runtime + dimensions
ffprobe -v quiet -print_format json -show_format -show_streams "/path/to/video.mp4" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); \
    [print(s.get('duration','?'),'sec |',s.get('width','?'),'x',s.get('height','?')) \
    for s in d['streams'] if s.get('codec_type')=='video']"

# Create frame output dir + extract at 3-second intervals
mkdir -p /tmp/muse_frames
ffmpeg -i "/path/to/video.mp4" -vf fps=1/3 /tmp/muse_frames/frame_%ds.jpg 2>&1 | tail -3
ls /tmp/muse_frames/ | sort
```

**Interval guide:**
- 90–120s video → fps=1/3 (~30 frames, covers every beat)
- 20–30s TikTok video → fps=1/2 (~12 frames)
- Already extracted? Check `/tmp/muse_frames/` before re-running ffmpeg.

**If URL only (no local file):** Note URL in brief as muse reference. Ask user for local copy.
Frames stored at: `/tmp/muse_frames/frame_Xs.jpg` (X = elapsed seconds)

---

## PHASE 2: FRAME READING — WHAT TO LOOK FOR

Read ALL frames using the Read tool. Never skip. Batch 3 frames per tool call for speed.

| Element | What to Note |
|---|---|
| **Setting** | Interior? Exterior? Warm? Clinical? Chaotic? |
| **Characters** | Real creator? Animated? Product objects with villain faces? Animals? |
| **Villain format** | Animated product objects with expressive faces + small arms? |
| **On-screen text** | Exact words. Which word is highlighted? Color? Position? |
| **Tone/lighting** | Warm golden? Cool clinical? Chaotic? Clean minimal? |
| **Scene energy** | Agitation/frustration OR resolution/warmth/calm? |

**6 structural questions — answer before writing a single word of the brief:**
1. How many distinct scenes? (count by setting/character changes, not frame count)
2. Exactly when does the tone flip from problem → solution? (which scene number?)
3. What is the character format? (villain animated objects? UGC creator? doctor?)
4. What is the on-screen text style? (karaoke word-by-word? full sentences? stacked?)
5. When does the product first appear? (what scene? floor/wall/box/hand?)
6. How does the CTA end? (stacked boxes? product close-up? person holding? static card?)

---

## PHASE 3: SCENE MAP FORMAT

```
SCENE MAP: [Muse Title] — [Total Runtime]

SCENE N  |  0–Xs
  Setting:   [description]
  Character: [villain format or creator type]
  Text:      "[word1]" → "[WORD2 — highlighted]" → "[word3]" → ...
  Beat:      HOOK / AGITATION / PRODUCT INTRO / SOCIAL PROOF / CTA
  Energy:    CHAOTIC / WARM / CLINICAL / ASPIRATIONAL

KEY STRUCTURAL FINDINGS:
  - Total scenes: N
  - Tone flip at: Scene N
  - Character format: [description]
  - Text style: [karaoke / sentences / stacked]
  - Product reveal: Scene N, [floor/wall/box]
  - CTA end format: [description]
```

---

## PHASE 4: ADAPTATION RULES

**The hierarchy — in order of priority:**
1. **Scene count is sacred** — if the muse has 9 scenes, the brief has 9 scenes. No exceptions.
2. **Scene TYPE is sacred** — if Scene 2 is "villain-inside-failed-product," the new brief Scene 2 must be villain-inside-failed-product equivalent.
3. **Character format is sacred** — animated villain objects → stay animated villain objects. Never swap to real people.
4. **Text rhythm is sacred** — karaoke word-by-word → specify karaoke word-by-word. Show exact muse text then new brand equivalent.
5. **Tone shift scene is sacred** — the warmth flip happens at the same scene number.
6. **Only the product + copy change** — everything else is replicated.

| Muse Element | Action |
|---|---|
| Animated product villain character | Keep format — swap to equivalent failed competitor product |
| Specific competitor brand names | Remove — use generic label ("Enzyme Cleaner," "Scented Plug-In") |
| Brand-specific animals | Keep same animals — emotional arc mirrors the problem/solution |
| Calendar on wall (60 days) | Adapt to match your guarantee period exactly |
| Social proof persona (gray-haired woman) | Match to target persona age and type |
| Product packaging color/design | Replace with real product from brand assets |
| Guarantee language | Must match brand compliance exactly |

---

## PHASE 5: BRIEF FORMAT FOR NEW MUSE-DRIVEN BRIEFS

Each scene must have:
```
[SCENE N header bar — brand secondary color]
  → Scene number + name + timecode

[MUSE reference strip — light gray, italics]
  → "MUSE: [exact description of what the muse does + exact text shown]"

[3-column table: VISUAL DIRECTION | ON-SCREEN TEXT | VOICEOVER]
```

**The ↑ mirrors: notation** — for every on-screen text line, show the muse equivalent:
```
→ RED LIGHT THERAPY
• AT HOME (highlight)
↑ mirrors: MOTHER CAT PRODUCES / SAFE HERE 24
```
This notation lets animators/editors confirm they are matching the muse, not improvising.

**Scene mapping table** — always the FIRST section of the brief:
```
| # | Muse — What Happens | New Brand — Equivalent Beat |
|---|---|---|
| 1 | [timecode + muse beat + exact text] | [new brand equivalent] |
```

---

## PHASE 6: FREEZE THE NEW FORMAT

After completing the brief, freeze the format so future sessions don't re-derive it:
1. Create `templates/ad-formats/<new-id>.md` — copy any existing format file as schema
2. Add row to `templates/ad-formats/INDEX.md`
3. Extract any reusable scene modules → `templates/scene-modules/<type>/<id>.md`
4. Add rows to `templates/scene-modules/INDEX.md`

---

## PROVEN EXAMPLE: TheraPet → Clarifion ODRx (April 2026)

**Muse:** TheraPet AI Animation | Runtime: 98.47s | 9:16 | 360×640 | 30fps
**URL:** facebook.com/100068524006696/posts/1227321179562004

| Scene | Timecode | Character | Text | Beat |
|---|---|---|---|---|
| 1 | 0–17s | Villain plug-in between 3 devices | WHY NOTHING CHANGED / AND YOU HAVE / MIGHT WORK | HOOK |
| 2 | 17–29s | Villain INSIDE litter box | YOU'VE SPENT $300 / IN EVERY ROOM / YOU ARE JUST | AGITATION 1 |
| 3 | 29–41s | Clay litter bag villain | YOU'VE TRIED CLAY / AND YOUR CATS / PROBLEM / SYSTEM | AGITATION 2 |
| 4 | 41–50s | Enzyme cleaner + vinegar villains | PROBLEM IS SOLVED / EXACTLY WHERE THEY | AGITATION 3 |
| 5 | 50–62s | Floxetine pill bottle villain | SURE THE SPRAYING / YOU GOT ZOMBIES / YOU'RE ZOMBIFYING | AGITATION 4 |
| 6 | 62–74s | **TONE FLIP** — 3 TheraPet units glowing | MARKING AND SPRAYING / ALL IN ONE | PRODUCT INTRO |
| 7 | 74–83s | Units plugged in, cat resting below | MOTHER CAT PRODUCES / SAFE HERE 24 | IN ACTION |
| 8 | 83–92s | Gray-haired woman + cats + calendar | 60 DAYS / NO MESS | SOCIAL PROOF |
| 9 | 92–98s | Stacked boxes + cats | PARENTS ALREADY / BACK GUARANTEED | CTA |

**Key findings:** 9 scenes. Tone flip at Scene 6. Karaoke word-by-word, green highlight. Villain objects with faces + arms. Product reveal in trio formation on floor.

**Frozen as:** `templates/ad-formats/villain-animation.md`

---

## CHECKLIST: BEFORE SUBMITTING A NEW MUSE-DRIVEN BRIEF

```
[ ] All frames read — none skipped
[ ] Scene count matches muse exactly
[ ] Scene mapping table on page 1
[ ] Every scene has a MUSE: reference strip
[ ] On-screen text word-by-word with ↑ mirrors: notation
[ ] Tone shift scene identified and explicitly called out
[ ] Villain/character format described exactly as in muse
[ ] Product reveal scene matches muse scene number and format
[ ] Social proof persona age + calendar day count correct
[ ] CTA has correct offer + guarantee language (compliance checked)
[ ] Brief ≤ 7 pages — tight, editor-readable
[ ] No paragraph essays inside scene blocks — 3-column table format
[ ] Format frozen in templates/ad-formats/ after brief is done
```

---

## CRITICAL FAILURE MODES (DO NOT REPEAT)

| Failure | What Happened | Correct Approach |
|---|---|---|
| Ignored muse structure | Wrote generic 5-section brief based on ad strategy, not the muse | Read every frame. Use the muse's scene count. |
| Wrong scene count | Brief had 5 sections, muse had 9 scenes | Scene count must match muse exactly — no exceptions |
| Generic visual direction | "animated home interior" — no villain spec | Describe character format exactly: animated object villains with faces and arms |
| Missing karaoke specifics | No ↑ mirrors notation | Every text line maps back to muse text |
| Prose-heavy scenes | Multi-paragraph essays in scene blocks | 3-column table, bullet-style, editor-readable |
| Re-extracting existing frames | Re-ran ffmpeg when frames already in /tmp/muse_frames/ | Always `ls /tmp/muse_frames/` before running ffmpeg |
| Skipping the freeze step | New format not added to template library | After every muse brief: freeze the format |
