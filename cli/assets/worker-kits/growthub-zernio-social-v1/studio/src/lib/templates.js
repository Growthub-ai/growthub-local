const STORAGE_KEY = 'zernio_comment_templates_v2';

export const TEMPLATE_TYPES = {
  send_dm:       { label: 'DM Only',       color: 'blue',   icon: '📩' },
  reply_comment: { label: 'Reply Only',     color: 'purple', icon: '💬' },
  both:          { label: 'Reply + DM',     color: 'green',  icon: '🔁' },
};

export const VARIABLES = [
  { token: '{{firstName}}',  desc: 'First name of commenter' },
  { token: '{{username}}',   desc: 'Platform handle (e.g. @ant0ni0)' },
  { token: '{{triggerWord}}',desc: 'The keyword they typed' },
  { token: '{{postLink}}',   desc: 'Link to the original post' },
  { token: '{{profileName}}',desc: 'Your profile/page name' },
];

export const MATCH_TYPES = {
  contains:    'Contains keyword',
  exact:       'Exact match',
  starts_with: 'Starts with keyword',
};

function read() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function write(templates) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

export function getTemplates() {
  return read();
}

export function saveTemplate(tpl) {
  const all = read();
  if (tpl.id) {
    const idx = all.findIndex(t => t.id === tpl.id);
    if (idx >= 0) { all[idx] = { ...tpl, updatedAt: new Date().toISOString() }; }
    else all.push({ ...tpl, createdAt: new Date().toISOString() });
  } else {
    all.push({ ...tpl, id: `tpl_${Date.now()}`, createdAt: new Date().toISOString() });
  }
  write(all);
  return all;
}

export function deleteTemplate(id) {
  const all = read().filter(t => t.id !== id);
  write(all);
  return all;
}

export function exportTemplates() {
  const blob = new Blob([JSON.stringify(read(), null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `zernio-templates-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importTemplates(json) {
  const imported = JSON.parse(json);
  if (!Array.isArray(imported)) throw new Error('Expected an array of templates');
  const existing = read();
  const merged   = [...existing];
  for (const t of imported) {
    if (!merged.find(e => e.id === t.id)) merged.push(t);
  }
  write(merged);
  return merged;
}

export function previewTemplate(body, vars = {}) {
  const sample = {
    firstName:   vars.firstName   || 'Alex',
    username:    vars.username    || '@alexsmith',
    triggerWord: vars.triggerWord || 'X',
    postLink:    vars.postLink    || 'https://x.com/example/status/123',
    profileName: vars.profileName || 'Your Brand',
  };
  return body
    .replace(/{{firstName}}/g,   sample.firstName)
    .replace(/{{username}}/g,    sample.username)
    .replace(/{{triggerWord}}/g, sample.triggerWord)
    .replace(/{{postLink}}/g,    sample.postLink)
    .replace(/{{profileName}}/g, sample.profileName);
}

const CAL = '[BOOK_CALL_LINK]';

export const SEED_TEMPLATES = [

  // ── 1. Winning Static Ads Playbook ──────────────────────────────────────
  {
    id: 'tpl_gh_ads_playbook',
    name: 'Winning Ads Playbook',
    type: 'both',
    keyword_hint: 'ADS, PLAYBOOK, STATIC',
    replyBody: `Sent! 📩 Check your DMs {{firstName}} — the ads playbook is on its way 🎯`,
    dmBody: `Hey {{firstName}}! Here's the Winning Static Ads Playbook for 2026 👉 https://www.growthub.ai/f/blog/static-ads-2026\n\nQuick one — what's your biggest challenge with ads right now? Happy to take a look or chat: ${CAL}`,
    createdAt: new Date().toISOString(),
  },

  // ── 2. Winning Prompts Playbook ──────────────────────────────────────────
  {
    id: 'tpl_gh_prompts_playbook',
    name: 'Winning Prompts Playbook',
    type: 'both',
    keyword_hint: 'PROMPTS, AI, PLAYBOOK',
    replyBody: `Sent! 📩 Your prompts playbook is in your DMs {{firstName}} 🤖`,
    dmBody: `Hey {{firstName}}! Here's the Winning Prompts Playbook 👉 https://www.growthub.ai/f/playbook\n\nWhich part of your workflow are you trying to speed up with AI? Drop a reply or book 10 mins: ${CAL}`,
    createdAt: new Date().toISOString(),
  },

  // ── 3. Nano Banana Starter Kit ───────────────────────────────────────────
  {
    id: 'tpl_gh_nano_banana',
    name: 'Nano Banana Starter Kit',
    type: 'both',
    keyword_hint: 'KIT, STARTER, NANO',
    replyBody: `Sent! 📩 The Nano Banana Starter Kit is in your DMs {{firstName}} 🍌`,
    dmBody: `Hey {{firstName}}! Here's your Nano Banana Starter Kit 👉 https://v0-nano-banana-starter-kit.vercel.app/\n\nWhat are you building? Drop a reply and let's figure it out together, or grab 10 mins: ${CAL}`,
    createdAt: new Date().toISOString(),
  },

  // ── 4. Free Competitor Ads Report ───────────────────────────────────────
  {
    id: 'tpl_gh_competitor_ads',
    name: 'Free Competitor Ads Report',
    type: 'both',
    keyword_hint: 'COMPETITOR, REPORT, SPY',
    replyBody: `Sent! 📩 Your free competitor ads report is in your DMs {{firstName}} 🔍`,
    dmBody: `Hey {{firstName}}! Grab your free competitor ads report here 👉 https://www.growthub.ai/f/winning-ads-signup\n\nWho are you up against right now? Would love to show you what's actually working in your space — book 10 mins: ${CAL}`,
    createdAt: new Date().toISOString(),
  },

  // ── 5. SEO / LLM / GEO Mastersheet ─────────────────────────────────────
  {
    id: 'tpl_gh_seo_mastersheet',
    name: 'SEO · LLM · GEO Mastersheet',
    type: 'both',
    keyword_hint: 'SEO, LLM, GEO, SEARCH',
    replyBody: `Sent! 📩 The SEO·LLM·GEO Mastersheet is in your DMs {{firstName}} 🗂`,
    dmBody: `Hey {{firstName}}! Here's the SEO · AEO · LLM · GEO Mastersheet 👉 https://www.notion.so/growthub/SEO-AEO-LLM-GEO-Mastersheet-2e4d28ab978380dbbff0e56e7ee28082\n\nAre you trying to show up in AI search right now? Curious what you're working on — or grab 10 mins: ${CAL}`,
    createdAt: new Date().toISOString(),
  },

  // ── 6. Free SEO / AEO / LLM Audit ──────────────────────────────────────
  {
    id: 'tpl_gh_seo_audit',
    name: 'Free SEO · AEO · LLM Audit',
    type: 'both',
    keyword_hint: 'AUDIT, FREE, TRAFFIC',
    replyBody: `Sent! 📩 Your free SEO·AEO audit is in your DMs {{firstName}} 📊`,
    dmBody: `Hey {{firstName}}! Run your free SEO · AEO · LLM audit here 👉 https://www.growthub.ai/onboarding-agent\n\nWhat's your current traffic situation? Happy to walk through the results — or book 10 mins: ${CAL}`,
    createdAt: new Date().toISOString(),
  },

  // ── 7. DTC Mega File ────────────────────────────────────────────────────
  {
    id: 'tpl_gh_dtc_mega',
    name: 'DTC Mega File',
    type: 'both',
    keyword_hint: 'DTC, ECOM, BRAND',
    replyBody: `Sent! 📩 The DTC Mega File is in your DMs {{firstName}} 📦`,
    dmBody: `Hey {{firstName}}! Here's the DTC Mega File 👉 https://growthub.notion.site/dtc-mega-file\n\nWhat stage is your brand at right now? Drop a reply or let's look at your numbers together: ${CAL}`,
    createdAt: new Date().toISOString(),
  },

  // ── 8. AI Batch Image Generation Guide ──────────────────────────────────
  {
    id: 'tpl_gh_ai_images',
    name: 'AI Batch Image Generation Guide',
    type: 'both',
    keyword_hint: 'IMAGES, BATCH, CREATIVE, AI',
    replyBody: `Sent! 📩 The AI Batch Image Mastery Guide is in your DMs {{firstName}} 🎨`,
    dmBody: `Hey {{firstName}}! Here's the AI Batch Image Generation Mastery Guide 👉 https://www.notion.so/growthub/AI-Batch-Image-Generation-Mastery-Guide-303d28ab978380cc89ccef0fccff4d52\n\nAre you already using AI for your creative? Would love to hear what's working — or book 10 mins: ${CAL}`,
    createdAt: new Date().toISOString(),
  },

  // ── 9. 500+ Proven Winning Hooks ────────────────────────────────────────
  {
    id: 'tpl_gh_hooks',
    name: '500+ Proven Winning Hooks',
    type: 'both',
    keyword_hint: 'HOOKS, COPY, CONTENT',
    replyBody: `Sent! 📩 500+ winning hooks are in your DMs {{firstName}} 🪝`,
    dmBody: `Hey {{firstName}}! Here's the 500+ Proven Winning Hooks library 👉 https://www.notion.so/growthub/2d7d28ab9783802aa48dcda105f8c63f?v=8e6120c3ec8e401daa8eaefad2de89d6\n\nWhat content format are you focused on right now? Happy to help you pick the right hooks — or book 10 mins: ${CAL}`,
    createdAt: new Date().toISOString(),
  },

];

export function seedIfEmpty() {
  if (!read().length) write(SEED_TEMPLATES);
}

export function forceSeed() {
  write(SEED_TEMPLATES);
}
