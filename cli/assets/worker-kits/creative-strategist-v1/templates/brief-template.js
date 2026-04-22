/**
 * VIDEO CREATIVE BRIEF — BASE TEMPLATE
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW TO USE:
 *   1. Copy this file: cp brief-template.js /tmp/docx_work/<slug>_brief_v1.js
 *   2. Fill in every CONFIG value from the client's brand-kit.md
 *   3. Replace all [PLACEHOLDER] values in CONTENT with real brief content
 *   4. Run: cd /tmp/docx_work && node <slug>_brief_v1.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, HeadingLevel,
  VerticalAlign, PageNumber, Header, Footer, PageBreak, ExternalHyperlink
} = require('docx');
const fs = require('fs');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG — pull every value from brand-kit.md
// ═══════════════════════════════════════════════════════════════════════════
const CONFIG = {
  // Brand identity
  client_name:       "[CLIENT NAME]",           // e.g. "Green Tree Wellness"
  doctor_name:       "[DR. NAME, CREDENTIALS]", // e.g. "Dr. Anthony Carabasi, DO"
  campaign_name:     "[CAMPAIGN NAME]",          // e.g. "Regenerative Medicine — Spring 2026"
  date:              "[MONTH YEAR]",             // e.g. "April 2026"
  output_path:       `${process.env.HOME}/Downloads/[ClientSlug]_Video_Creative_Brief_v1_[DATE].docx`,

  // Brief metadata
  video_length:      "[XX seconds]",
  hook_count:        5,                          // number of hook variations (A–E by default)
  primary_goal:      "[Conversion / Awareness / Education / Trust-Building]",

  // Colors (hex, no #) — from brand-kit.md
  color_primary:     "2D6A4F",   // main brand color — used for section headers
  color_secondary:   "40916C",   // accent — used for sub-heads, scene bars, hook stripe
  color_light:       "D8F3DC",   // light tint — table shading, backgrounds
  color_dark:        "1B1B1B",   // body text
  color_mid_gray:    "6B7280",   // footer, secondary text
  color_white:       "FFFFFF",
  color_warn_bg:     "FFF8E1",   // alert box background
  color_warn_border: "E5A800",   // alert box border

  // Constraint / guardrail message (from brand-kit.md → messaging_guardrails)
  brand_constraint:  "[PASTE THE CRITICAL BRAND CONSTRAINT HERE — what this ad must NEVER say or do]",
};

// ═══════════════════════════════════════════════════════════════════════════
// CONTENT — fill in from brief inputs + brand kit
// ═══════════════════════════════════════════════════════════════════════════
const BRIEF = {
  // ── Brief Overview fields ────────────────────────────────────────────────
  overview: [
    ["Length",               CONFIG.video_length],
    ["Format",               "[UGC + B-Roll / Doctor-Led / Explainer / Performance CTA]"],
    ["Primary Goal",         CONFIG.primary_goal],
    ["Voiceover",            "[Who speaks + what role — e.g. AI UGC on-camera + warm male VO]"],
    ["Tone",                 "[3–5 adjectives from brand kit — e.g. Warm, Credible, Science-informed]"],
    ["AI Avatar Required",   "[Yes / No] → Type: [Photoreal / Talking Head / UGC]"],
    ["Voiceover Setup",      "[VO only / VO + sync / UGC dialogue + VO / founder VO / AI VO]"],
    ["Voice Type",           "[Male/Female/Neutral | Age | Tone | Accent]"],
    ["UGC Asset Requirements","[Yes / No] → Folder: [link or creator reference]"],
    ["Brand Image Availability","[Air.inc / Drive / Instagram / Website link]"],
    ["Video References",     "[Inspiration links or 'None provided']"],
  ],

  // ── Core Ad Concept ──────────────────────────────────────────────────────
  concept_paragraph_1: "[High-level description of the ad concept, narrative, and intended emotional impact. Who is the main subject? What is their journey? How does the brand solve their problem?]",
  concept_paragraph_2: "[Optional second paragraph — positioning, differentiation, or strategic context.]",
  emotional_arc:        "[Struggle → Recognition → Transformation → Action]",  // customize per brand
  concept_kv: [
    ["Target Audience",  "[Age range + pain point + intent]"],
    ["Core Message",     "[One sentence — the brand promise delivered through this video]"],
    ["B-Roll Cadence",   "[e.g. Cut every ~3 seconds — never >3s of uninterrupted talking head]"],
    ["What to AVOID",    "[Specific language, imagery, or patient types to exclude — from brand kit]"],
  ],

  // ── Scene 1: Hook intro note ─────────────────────────────────────────────
  hook_intro: "[N] hook variations are provided below. Test all [N] as separate ad sets. Scene 1 is the only section that changes between variations — Scenes 2, 3, and 4 remain identical across all.",

  // ── Scene 1 block (shared across all hooks) ──────────────────────────────
  scene1_rows: [
    ["On-Screen Text", "[None / specific text overlay]"],
    ["VO",             "[None — AI UGC actor speaks directly / or specify VO line]"],
    ["Client Line",    "[Opening hook dialogue — the scroll-stopping line]"],
    ["Purpose",        "[Strategic role of this scene — what it must achieve in 0–3 seconds]"],
  ],

  // ── Hook Variations — add/remove as needed ───────────────────────────────
  hooks: [
    {
      letter: "A",
      label:  "[Hook A — Short Descriptive Label]",
      content: "[Shot description, camera movement, lighting, mood, actor direction for Hook A]"
    },
    {
      letter: "B",
      label:  "[Hook B — Short Descriptive Label]",
      content: "[Shot description, camera movement, lighting, mood, actor direction for Hook B]"
    },
    {
      letter: "C",
      label:  "[Hook C — Short Descriptive Label]",
      content: "[Shot description, camera movement, lighting, mood, actor direction for Hook C]"
    },
    {
      letter: "D",
      label:  "[Hook D — Short Descriptive Label]",
      content: "[Shot description, camera movement, lighting, mood, actor direction for Hook D]"
    },
    {
      letter: "E",
      label:  "[Hook E — Short Descriptive Label]",
      content: "[Shot description, camera movement, lighting, mood, actor direction for Hook E]"
    },
  ],

  // ── Scene 2 ──────────────────────────────────────────────────────────────
  scene2_title:    "SCENE 2 — [Name: e.g. The Struggle & Recognition]",
  scene2_timecode: "[8–16 seconds]  |  Consistent across all [N] variations",
  scene2_rows: [
    ["Visual Direction", "[B-roll description — what we see, in what order, with what emotional purpose]"],
    ["VO",               "[VO line — word for word]"],
    ["On-Screen Text",   "[Text overlay or 'None']"],
    ["Purpose",          "[Strategic role of this scene]"],
    ["Transition",       "[How we move from this scene to the next]"],
  ],

  // ── Scene 3 ──────────────────────────────────────────────────────────────
  scene3_title:    "SCENE 3 — [Name: e.g. Transformation & Results]",
  scene3_timecode: "[16–24 seconds]  |  Consistent across all [N] variations",
  scene3_rows: [
    ["Visual Direction", "[B-roll / on-camera description — the 'after' state]"],
    ["Client VO (on-camera)", "[On-camera dialogue line]"],
    ["On-Screen Text",   "[Text overlay or 'None']"],
    ["Purpose",          "[Strategic role — proof, transformation, emotion]"],
    ["Transition",       "[Scene transition type]"],
  ],

  // ── Scene 4: CTA ─────────────────────────────────────────────────────────
  scene4_title:    "SCENE 4 — CTA + Offer Close",
  scene4_timecode: "[24–32 seconds]  |  Consistent across all [N] variations",
  scene4_rows: [
    ["Visual Direction", "[Branded close — doctor/founder + logo + CTA graphics]"],
    ["Male VO (CTA)",    "[CTA line — word for word. Include: doctor name, brand name, action, urgency]"],
    ["On-Screen Text",   "[Brand Name]\n[Service Name]\n[Phone Number]  |  [Website]\n[CTA Offer Text]"],
    ["Purpose",          "[Drive the one action: consultation booking / call / website visit]"],
  ],

  // ── Editing Guidelines ───────────────────────────────────────────────────
  editing_guidelines: [
    "[B-roll cadence rule — e.g. cut every ~3 seconds]",
    "[Color grade direction — e.g. warm golden tones / clinical cool / vibrant energetic]",
    "[Music direction — e.g. warm emotional underscore / upbeat lifestyle / no music]",
    "[Caption rule — always ON by default]",
    "[On-screen text rule — when it appears and when it doesn't]",
    "[Pacing note — measured/human vs fast-cut performance]",
    "[End frame description — what the last 2 seconds look like]",
    "[Specific NO list — imagery or language to never use]",
    "[UGC actor age/look requirement]",
    "[CTA readability note — phone number size for target audience]",
  ],
  aspect_ratios: [
    "9:16  (Instagram/TikTok Reels, Stories) — Primary",
    "1:1   (Facebook / Instagram Feed) — Secondary",
    "16:9  (YouTube Pre-Roll) — Optional",
  ],

  // ── Appendix: AI Video Prompts (OPTIONAL) ────────────────────────────────
  // One entry per hook + one per scene (2, 3, 4)
  appendix_prompts: [
    { label: "HOOK A — [Label]", prompt: "[Full Veo 3.1 / Runway / Sora generation prompt for Hook A]" },
    { label: "HOOK B — [Label]", prompt: "[Full prompt for Hook B]" },
    { label: "HOOK C — [Label]", prompt: "[Full prompt for Hook C]" },
    { label: "HOOK D — [Label]", prompt: "[Full prompt for Hook D]" },
    { label: "HOOK E — [Label]", prompt: "[Full prompt for Hook E]" },
    { label: "SCENE 2 — B-Roll Prompt", prompt: "[Full prompt for Scene 2 B-roll generation]" },
    { label: "SCENE 3 — Transformation B-Roll", prompt: "[Full prompt for Scene 3 B-roll]" },
    { label: "SCENE 4 — CTA Close", prompt: "[Full prompt for Scene 4 branded close]" },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// DESIGN SYSTEM — do not edit below this line unless changing structure
// ═══════════════════════════════════════════════════════════════════════════
const C = CONFIG; // shorthand
const bdr   = { style: BorderStyle.SINGLE, size: 1, color: C.color_light };
const bdrs  = { top: bdr, bottom: bdr, left: bdr, right: bdr };
const noBdr = { style: BorderStyle.NONE, size: 0, color: C.color_white };
const noBdrs= { top: noBdr, bottom: noBdr, left: noBdr, right: noBdr };

const sp = (pts=120) => new Paragraph({ spacing:{before:pts,after:0}, children:[] });

function run(text, opts={}) {
  return new TextRun({ text, font:"Arial", size:20, color:C.color_dark, ...opts });
}
function para(children, opts={}) {
  return new Paragraph({ spacing:{before:60,after:60}, children, ...opts });
}
function bullet(text) {
  return new Paragraph({
    spacing:{before:40,after:40}, indent:{left:400,hanging:280},
    children:[
      new TextRun({ text:"•  ", bold:true, color:C.color_secondary, font:"Arial", size:20 }),
      new TextRun({ text, font:"Arial", size:20, color:C.color_dark })
    ]
  });
}
function h2(text) {
  // Uses Heading2 style (defined in paragraphStyles above) inside a colored cell.
  // This makes headings semantic and TOC-compatible while preserving the visual bar.
  return new Table({ width:{size:9360,type:WidthType.DXA}, columnWidths:[9360],
    rows:[new TableRow({ children:[new TableCell({
      borders:noBdrs, shading:{fill:C.color_primary,type:ShadingType.CLEAR},
      margins:{top:100,bottom:100,left:200,right:200},
      children:[new Paragraph({ heading:HeadingLevel.HEADING_2, spacing:{before:30,after:30},
        children:[new TextRun({text,bold:true,size:24,font:"Arial",color:C.color_white})] })]
    })]})]
  });
}
function h3(text) {
  // Uses Heading3 style with left-border accent. Standalone paragraph (no table).
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing:{before:220,after:80},
    border:{left:{style:BorderStyle.THICK,size:12,color:C.color_secondary}},
    indent:{left:160},
    children:[new TextRun({text,bold:true,size:22,font:"Arial",color:C.color_secondary})]
  });
}
// External hyperlink — use for muse URLs, reference links, landing pages
function hyperlink(displayText, url) {
  return new ExternalHyperlink({
    link: url,
    children:[new TextRun({text:displayText,style:"Hyperlink",font:"Arial",size:20})]
  });
}
function kvRow(label, value, shade) {
  return new TableRow({ children:[
    new TableCell({ borders:bdrs, width:{size:2800,type:WidthType.DXA},
      shading:{fill:shade?C.color_light:"F4FCF6",type:ShadingType.CLEAR},
      margins:{top:80,bottom:80,left:160,right:160},
      children:[para([new TextRun({text:label,bold:true,size:19,font:"Arial",color:C.color_secondary})])]
    }),
    new TableCell({ borders:bdrs, width:{size:6560,type:WidthType.DXA},
      margins:{top:80,bottom:80,left:160,right:160},
      children:[para([run(value,{size:19})])]
    })
  ]});
}
function kvTable(rows) {
  return new Table({ width:{size:9360,type:WidthType.DXA}, columnWidths:[2800,6560],
    rows: rows.map(([l,v],i) => kvRow(l,v,i%2===0))
  });
}
function alertBox(text) {
  return new Table({ width:{size:9360,type:WidthType.DXA}, columnWidths:[9360],
    rows:[new TableRow({ children:[new TableCell({
      borders:{top:{style:BorderStyle.SINGLE,size:4,color:C.color_warn_border},bottom:{style:BorderStyle.SINGLE,size:4,color:C.color_warn_border},left:{style:BorderStyle.THICK,size:20,color:C.color_warn_border},right:bdr},
      shading:{fill:C.color_warn_bg,type:ShadingType.CLEAR},
      margins:{top:120,bottom:120,left:220,right:220},
      children:[para([new TextRun({text:"⚠  "+text,bold:true,size:19,font:"Arial",color:"7D4E00"})])]
    })]})]
  });
}
function sceneBlock(title, timecode, rows) {
  const hRow = new TableRow({ children:[new TableCell({
    columnSpan:2, borders:bdrs,
    shading:{fill:C.color_secondary,type:ShadingType.CLEAR},
    margins:{top:100,bottom:100,left:200,right:200},
    children:[para([new TextRun({text:`${title}   |   ${timecode}`,bold:true,size:21,font:"Arial",color:C.color_white})])]
  })]});
  const dRows = rows.filter(Boolean).map(([lbl,content]) =>
    new TableRow({ children:[
      new TableCell({ borders:bdrs, width:{size:1800,type:WidthType.DXA},
        shading:{fill:C.color_light,type:ShadingType.CLEAR},
        margins:{top:70,bottom:70,left:160,right:160},
        children:[para([new TextRun({text:lbl,bold:true,size:18,font:"Arial",color:C.color_secondary})])]
      }),
      new TableCell({ borders:bdrs, width:{size:7560,type:WidthType.DXA},
        margins:{top:70,bottom:70,left:160,right:160},
        children: content.split("\n\n").map(b=>new Paragraph({spacing:{before:40,after:40},children:[run(b,{size:19})]}))
      })
    ]})
  );
  return new Table({ width:{size:9360,type:WidthType.DXA}, columnWidths:[1800,7560], rows:[hRow,...dRows] });
}
function hookCard(letter, label, content) {
  return new Table({ width:{size:9360,type:WidthType.DXA}, columnWidths:[200,9160],
    rows:[new TableRow({ children:[
      new TableCell({ borders:noBdrs, width:{size:200,type:WidthType.DXA},
        shading:{fill:C.color_secondary,type:ShadingType.CLEAR},
        margins:{top:100,bottom:100,left:60,right:60}, verticalAlign:VerticalAlign.CENTER,
        children:[para([new TextRun({text:letter,bold:true,size:22,font:"Arial",color:C.color_white})],{alignment:AlignmentType.CENTER})]
      }),
      new TableCell({ borders:{top:bdr,bottom:bdr,left:noBdr,right:bdr},
        shading:{fill:"F4FCF6",type:ShadingType.CLEAR},
        margins:{top:100,bottom:100,left:200,right:200},
        children:[
          para([new TextRun({text:`HOOK ${letter}  —  ${label}`,bold:true,size:20,font:"Arial",color:C.color_secondary})]),
          ...content.split("\n\n").map(b=>new Paragraph({spacing:{before:40,after:40},children:[run(b,{size:19})]}))
        ]
      })
    ]})]
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENT ASSEMBLY
// ═══════════════════════════════════════════════════════════════════════════
const doc = new Document({
  styles:{
    default:{ document:{ run:{ font:"Arial", size:20, color:C.color_dark } } },
    paragraphStyles:[
      // Heading2: used for colored section bars (white text, rendered inside colored table cells)
      { id:"Heading2", name:"Heading 2", basedOn:"Normal", next:"Normal", quickFormat:true,
        run:{ bold:true, size:21, font:"Arial", color:"FFFFFF" },
        paragraph:{ spacing:{ before:30, after:30 }, outlineLevel:1 } },
      // Heading3: used for sub-section labels (blue accent, standalone paragraph with left border)
      { id:"Heading3", name:"Heading 3", basedOn:"Normal", next:"Normal", quickFormat:true,
        run:{ bold:true, size:22, font:"Arial", color:C.color_secondary },
        paragraph:{ spacing:{ before:220, after:80 }, outlineLevel:2 } },
    ]
  },
  sections:[{
    properties:{
      page:{
        size:{ width:12240, height:15840 },
        margin:{ top:1440, right:1440, bottom:1440, left:1440 }  // 1 inch — matches 9360 table widths
      }
    },
    headers:{
      default: new Header({ children:[
        new Table({ width:{size:9360,type:WidthType.DXA}, columnWidths:[5820,3540],
          rows:[new TableRow({ children:[
            new TableCell({ borders:noBdrs, shading:{fill:C.color_primary,type:ShadingType.CLEAR}, margins:{top:80,bottom:80,left:200,right:200},
              children:[para([new TextRun({text:`${C.client_name}  |  Video Creative Brief`,bold:true,size:20,font:"Arial",color:C.color_white})])]
            }),
            new TableCell({ borders:noBdrs, shading:{fill:C.color_secondary,type:ShadingType.CLEAR}, verticalAlign:VerticalAlign.CENTER, margins:{top:80,bottom:80,left:160,right:160},
              children:[para([new TextRun({text:`${C.campaign_name}  |  ${C.date}`,size:18,font:"Arial",color:C.color_white})],{alignment:AlignmentType.RIGHT})]
            })
          ]})]
        })
      ]})
    },
    footers:{
      default: new Footer({ children:[
        para([
          run(`${C.client_name}  —  Confidential   |   Page `,{size:17,color:C.color_mid_gray}),
          new TextRun({children:[PageNumber.CURRENT],size:17,font:"Arial",color:C.color_mid_gray})
        ])
      ]})
    },
    children:[
      // TITLE BLOCK
      sp(40),
      new Table({ width:{size:9360,type:WidthType.DXA}, columnWidths:[9360],
        rows:[new TableRow({ children:[new TableCell({
          borders:noBdrs, shading:{fill:C.color_primary,type:ShadingType.CLEAR},
          margins:{top:280,bottom:280,left:360,right:360},
          children:[
            new Paragraph({alignment:AlignmentType.CENTER, children:[new TextRun({text:C.client_name.toUpperCase(),bold:true,size:56,font:"Arial",color:C.color_white})]}),
            new Paragraph({alignment:AlignmentType.CENTER, spacing:{before:80}, children:[new TextRun({text:`Video Creative Brief  —  ${C.campaign_name}`,size:26,font:"Arial",color:C.color_light})]}),
            new Paragraph({alignment:AlignmentType.CENTER, spacing:{before:60}, children:[new TextRun({text:`1 Video Creative  |  ${C.hook_count} Hook Variations  |  ${C.date}`,size:20,font:"Arial",color:C.color_light})]}),
          ]
        })]})]
      }),
      sp(160),

      // BRAND CONSTRAINT ALERT
      alertBox(C.brand_constraint),
      sp(160),

      // BRIEF OVERVIEW
      h2("BRIEF OVERVIEW"),
      sp(80),
      kvTable(BRIEF.overview),
      sp(180),

      // 1. CORE AD CONCEPT
      h2("1. CORE AD CONCEPT"),
      sp(80),
      para([run(BRIEF.concept_paragraph_1)]),
      ...(BRIEF.concept_paragraph_2 ? [sp(60), para([run(BRIEF.concept_paragraph_2)])] : []),
      sp(60),
      para([new TextRun({text:`Emotional arc:  ${BRIEF.emotional_arc}`,bold:true,color:C.color_secondary,size:20,font:"Arial"})]),
      sp(80),
      kvTable(BRIEF.concept_kv),
      sp(180),

      // 2. STRUCTURE & VO
      h2("2. STRUCTURE & VOICEOVER BREAKDOWN"),
      sp(120),

      // Scene 1
      h3(`A.  SCENE 1 — Opening Hook   (0–${Math.round(32/4)} seconds)`),
      sp(60),
      para([new TextRun({text:BRIEF.hook_intro,italics:true,size:19,font:"Arial",color:C.color_mid_gray})]),
      sp(80),
      sceneBlock("SCENE 1 — HOOK WINDOW","0–3 seconds  |  MUST stop the scroll",BRIEF.scene1_rows),
      sp(100),
      para([new TextRun({text:`${C.hook_count} HOOK VARIATIONS — Scene 1 Only`,bold:true,size:22,font:"Arial",color:C.color_primary})]),
      sp(60),
      ...BRIEF.hooks.flatMap(h => [hookCard(h.letter, h.label, h.content), sp(80)]),
      sp(60),

      // Scene 2
      h3(`B.  ${BRIEF.scene2_title}`),
      sp(80),
      sceneBlock(BRIEF.scene2_title, BRIEF.scene2_timecode, BRIEF.scene2_rows),
      sp(140),

      // Scene 3
      h3(`C.  ${BRIEF.scene3_title}`),
      sp(80),
      sceneBlock(BRIEF.scene3_title, BRIEF.scene3_timecode, BRIEF.scene3_rows),
      sp(140),

      // Scene 4
      h3(`D.  ${BRIEF.scene4_title}`),
      sp(80),
      sceneBlock(BRIEF.scene4_title, BRIEF.scene4_timecode, BRIEF.scene4_rows),
      sp(180),

      // 3. EDITING GUIDELINES
      h2("3. EDITING GUIDELINES"),
      sp(100),
      ...BRIEF.editing_guidelines.map(g => bullet(g)),
      sp(80),
      para([new TextRun({text:"Aspect Ratio Deliverables:",bold:true,size:20,font:"Arial",color:C.color_secondary})]),
      ...BRIEF.aspect_ratios.map(r => bullet(r)),
      sp(180),

      // PAGE BREAK → APPENDIX
      new Paragraph({children:[new PageBreak()]}),
      new Table({ width:{size:9360,type:WidthType.DXA}, columnWidths:[9360],
        rows:[new TableRow({ children:[new TableCell({
          borders:noBdrs, shading:{fill:C.color_mid_gray,type:ShadingType.CLEAR},
          margins:{top:160,bottom:160,left:280,right:280},
          children:[
            new Paragraph({alignment:AlignmentType.CENTER, children:[new TextRun({text:"APPENDIX — AI VIDEO GENERATION PROMPTS",bold:true,size:28,font:"Arial",color:C.color_white})]}),
            new Paragraph({alignment:AlignmentType.CENTER, spacing:{before:60}, children:[new TextRun({text:"Optional reference  |  Veo 3.1 / Runway / Sora  |  Use only if generating AI video synthetically",size:19,font:"Arial",color:"E5E7EB"})]}),
          ]
        })]})]
      }),
      sp(80),
      para([new TextRun({text:"These prompts are provided as optional references. They are NOT required to execute this creative.",italics:true,size:19,font:"Arial",color:C.color_mid_gray})]),
      sp(120),
      ...BRIEF.appendix_prompts.flatMap(p => [
        h3(p.label),
        para([run(p.prompt,{size:19})]),
        sp(80),
      ]),
      sp(120),
      new Paragraph({
        alignment:AlignmentType.CENTER,
        children:[new TextRun({text:`${C.client_name}  —  Video Creative Brief  —  Confidential  —  ${C.date}`,size:18,font:"Arial",color:C.color_mid_gray,italics:true})]
      }),
    ]
  }]
});

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT
// ═══════════════════════════════════════════════════════════════════════════
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(CONFIG.output_path, buf);
  console.log("DONE: " + CONFIG.output_path);
});
