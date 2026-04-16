import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const studioDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(studioDir, "dist");
const host = process.env.HOST || "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "4173", 10);

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".ico", "image/x-icon"],
  [".txt", "text/plain; charset=utf-8"],
]);

// ── LinkedIn fetch via AppleScript → Chrome tab (proven working method) ──────

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function osascriptSync(script) {
  return spawnSync("osascript", ["-l", "JavaScript", "-e", script], { encoding: "utf8" }).stdout.trim();
}

function findLinkedInTab() {
  const out = osascriptSync(
    `var chrome=Application("Google Chrome"),found='none';` +
    `for(var w=0;w<chrome.windows.length&&found==='none';w++){` +
    `for(var t=0;t<chrome.windows[w].tabs.length&&found==='none';t++){` +
    `if(chrome.windows[w].tabs[t].url().indexOf('linkedin.com')!==-1){found=w+','+t;}}}found;`
  );
  const ref = (out.trim()).split(",");
  if (ref.length !== 2 || isNaN(Number(ref[0]))) return null;
  return { w: Number(ref[0]), t: Number(ref[1]) };
}

function execInTab(w, t, js) {
  return osascriptSync(
    `Application("Google Chrome").windows[${w}].tabs[${t}].execute({javascript: ${JSON.stringify(js)}})`
  );
}

async function fetchLinkedInPostsViaChrome(fsdProfileUrn) {
  const tab = findLinkedInTab();

  // No Chrome tab open — fall back to cookie-based direct fetch
  if (!tab) {
    const cookies = readLinkedInCookiesFromChrome();
    if (!cookies) return null;
    const { li_at, JSESSIONID: jsessionid } = cookies;
    const csrf = jsessionid.replace(/^["']|["']$/g, "");
    const params = new URLSearchParams({
      q: "memberShareFeed", moduleKey: "member-shares:phone",
      includeLongTermHistory: "true", profileUrn: fsdProfileUrn, count: "20", start: "0",
    });
    try {
      const r = await fetch(`https://www.linkedin.com/voyager/api/identity/profileUpdatesV2?${params}`, {
        headers: {
          Accept: "application/vnd.linkedin.normalized+json+2.1",
          Cookie: `li_at=${li_at}; JSESSIONID=${jsessionid}`,
          "csrf-token": csrf, "x-li-lang": "en_US",
          "x-restli-protocol-version": "2.0.0",
          "x-li-track": '{"clientVersion":"1.13.13","osName":"web","deviceFormFactor":"DESKTOP","mpName":"voyager-web"}',
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Referer: "https://www.linkedin.com/feed/",
        },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return null;
      const posts = (data.included || [])
        .filter(i => i["$type"] === "com.linkedin.voyager.feed.render.UpdateV2")
        .map(p => {
          const urn = p.updateMetadata?.urn || "";
          const id = urn.replace(/^urn:li:(activity|share):/, "");
          const permalink = p.updateMetadata?.updateActions?.permalink ||
            (urn ? `https://www.linkedin.com/feed/update/${encodeURIComponent(urn)}/` : "");
          return {
            id, platform: "linkedin",
            message: p.commentary?.text?.text || "",
            urn, permalink,
            commentCount: p.socialDetail?.totalSocialActivityCounts?.numComments || 0,
            likeCount: p.socialDetail?.totalSocialActivityCounts?.numLikes || 0,
            createdTime: new Date().toISOString(),
            _fromVoyager: true,
          };
        }))
        .filter(p => p.id && p.message);
      return { posts };
    } catch { return null; }
  }
  const { w, t } = tab;

  const js = `(function(){
  window.__li_posts_result=null;
  var csrf=document.cookie.split('; ').find(function(c){return c.startsWith('JSESSIONID=');});
  csrf=csrf?csrf.split('=').slice(1).join('=').replace(/^"|"$/g,''):'';
  var params='q=memberShareFeed&moduleKey=member-shares%3Aphone&includeLongTermHistory=true&profileUrn=${encodeURIComponent(fsdProfileUrn)}&count=20&start=0';
  fetch('/voyager/api/identity/profileUpdatesV2?'+params,{headers:{'Accept':'application/vnd.linkedin.normalized+json+2.1','csrf-token':csrf,'x-li-lang':'en_US','x-restli-protocol-version':'2.0.0','x-li-track':'{"clientVersion":"1.13.13","osName":"web","deviceFormFactor":"DESKTOP","mpName":"voyager-web"}'}})
  .then(function(r){return r.json();}).then(function(data){
    var posts=(data.included||[]).filter(function(i){return i['$type']==='com.linkedin.voyager.feed.render.UpdateV2';})
    .map(function(p){var u=p.updateMetadata&&p.updateMetadata.urn||'';var id=u.replace(/^urn:li:(activity|share):/,'');var pl=(p.updateMetadata&&p.updateMetadata.updateActions&&p.updateMetadata.updateActions.permalink)||'https://www.linkedin.com/feed/update/'+encodeURIComponent(u)+'/';return{id:id,platform:'linkedin',message:p.commentary&&p.commentary.text&&p.commentary.text.text||'',urn:u,permalink:pl,commentCount:p.socialDetail&&p.socialDetail.totalSocialActivityCounts&&p.socialDetail.totalSocialActivityCounts.numComments||0,likeCount:p.socialDetail&&p.socialDetail.totalSocialActivityCounts&&p.socialDetail.totalSocialActivityCounts.numLikes||0,createdTime:new Date().toISOString(),_fromVoyager:true};}).filter(function(p){return p.id&&p.message;});
    window.__li_posts_result=JSON.stringify({posts:posts});
  }).catch(function(e){window.__li_posts_result=JSON.stringify({error:e.message});});
  return 'ok';
})()`;

  execInTab(w, t, js);

  // Poll with proper async sleep — does NOT block the event loop
  for (let i = 0; i < 16; i++) {
    await sleep(500);
    const val = execInTab(w, t, "window.__li_posts_result || null");
    if (val && val !== "null") {
      try { return JSON.parse(val); } catch { return null; }
    }
  }
  return null;
}

// ── Chrome local cookie reader (macOS) ───────────────────────────────────────

const CHROME_BASE = path.join(os.homedir(), "Library/Application Support/Google/Chrome");
const CHROME_PROFILES = ["Profile 7", "Profile 1", "Default", "Profile 2", "Profile 3", "Profile 4", "Profile 5", "Profile 6"];

function findChromeCookieDb() {
  for (const profile of CHROME_PROFILES) {
    const dbPath = path.join(CHROME_BASE, profile, "Cookies");
    if (!fs.existsSync(dbPath)) continue;
    const tmp = path.join(os.tmpdir(), `gh_li_${profile.replace(" ", "_")}.db`);
    try {
      fs.copyFileSync(dbPath, tmp);
    } catch {
      continue;
    }
    const check = spawnSync("sqlite3", [tmp,
      "SELECT count(*) FROM cookies WHERE host_key LIKE '%linkedin%' AND name='li_at';"
    ], { encoding: "utf8" });
    if (check.stdout.trim() === "1") return tmp;
  }
  return null;
}

function getChromeDecryptionKey() {
  const r = spawnSync("security", [
    "find-generic-password", "-w", "-a", "Chrome", "-s", "Chrome Safe Storage"
  ], { encoding: "utf8" });
  if (r.status !== 0 || !r.stdout.trim()) return null;
  return crypto.pbkdf2Sync(r.stdout.trim(), "saltysalt", 1003, 16, "sha1");
}

function decryptChromeValue(hexVal, key) {
  try {
    const encBuf = Buffer.from(hexVal, "hex");
    const encrypted = encBuf.slice(3); // strip v10 prefix
    const iv = Buffer.alloc(16, " ");
    const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function readLinkedInCookiesFromChrome() {
  const dbPath = findChromeCookieDb();
  if (!dbPath) return null;

  const key = getChromeDecryptionKey();
  if (!key) return null;

  const result = spawnSync("sqlite3", [dbPath,
    "SELECT name, hex(encrypted_value) FROM cookies WHERE host_key LIKE '%linkedin%' AND name IN ('li_at','JSESSIONID');"
  ], { encoding: "utf8" });

  if (result.status !== 0) return null;

  const cookies = {};
  for (const line of result.stdout.trim().split("\n")) {
    if (!line) continue;
    const [name, hexVal] = line.split("|");
    if (!name || !hexVal) continue;
    const val = decryptChromeValue(hexVal, key);
    if (val) cookies[name] = val;
  }

  return cookies.li_at ? cookies : null;
}

// ── Post normalizer ───────────────────────────────────────────────────────────

function normalizeLiPosts(data) {
  const elements = data?.elements || data?.data?.elements || [];
  return elements.map(el => {
    const update = el?.value?.["com.linkedin.voyager.feed.render.UpdateV2"] || {};
    const text = update?.commentary?.text?.text || "";
    const meta = update?.updateMetadata || {};
    const urn = meta?.urn || "";
    const permalink =
      meta?.updateActions?.permalink ||
      (urn ? `https://www.linkedin.com/feed/update/${encodeURIComponent(urn)}/` : "");
    const activityId = urn.replace(/^urn:li:(activity|share):/, "");
    const social = update?.socialDetail?.totalSocialActivityCounts || {};
    let picture = null;
    const content = update?.content;
    if (content) {
      const img =
        content["com.linkedin.voyager.feed.render.ImageComponent"] ||
        content["com.linkedin.voyager.feed.render.ArticleComponent"];
      picture = img?.largeImage?.attributes?.[0]?.vectorImage?.rootUrl || null;
    }
    return {
      id: activityId,
      platform: "linkedin",
      message: text,
      permalink,
      commentCount: social.numComments ?? 0,
      likeCount: social.numLikes ?? 0,
      createdTime: new Date().toISOString(),
      mediaType: content ? "IMAGE" : null,
      picture,
      _fromVoyager: true,
    };
  }).filter(p => p.id && p.message);
}

// ── Route handlers ────────────────────────────────────────────────────────────

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

function json(res, status, data) {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

async function handleCookieCheck(req, res) {
  const tab = findLinkedInTab();
  const hasTab = !!tab;
  let fsdUrn = "";

  if (tab) {
    const { w, t } = tab;
    execInTab(w, t, `window.__li_fsd_urn=null;fetch('/voyager/api/me',{headers:{'Accept':'application/vnd.linkedin.normalized+json+2.1','csrf-token':document.cookie.split('; ').find(c=>c.startsWith('JSESSIONID='))?.split('=').slice(1).join('=').replace(/^"|"$/g,'')||'','x-li-lang':'en_US','x-restli-protocol-version':'2.0.0','x-li-track':'{"clientVersion":"1.13.13"}'}}).then(r=>r.json()).then(d=>{var m=(d.included||[]).find(i=>i.dashEntityUrn);window.__li_fsd_urn=m?m.dashEntityUrn:'';}).catch(()=>{});'ok'`);
    await sleep(2000);
    fsdUrn = execInTab(w, t, "window.__li_fsd_urn || ''");
  }

  json(res, 200, { found: hasTab, fsdUrn: fsdUrn || "" });
}

function handleOpenChrome(req, res) {
  spawnSync("open", ["-a", "Google Chrome", "https://www.linkedin.com/login"]);
  json(res, 200, { opened: true });
}

async function handleLinkedInProxy(req, res) {
  let body = "";
  for await (const chunk of req) body += chunk;

  let profileUrn;
  try {
    ({ profileUrn } = JSON.parse(body));
  } catch {
    json(res, 400, { error: "Invalid JSON body" });
    return;
  }

  if (!profileUrn) {
    json(res, 400, { error: "profileUrn is required" });
    return;
  }

  // Proven method: execute fetch inside the real Chrome LinkedIn tab via AppleScript
  const result = await fetchLinkedInPostsViaChrome(profileUrn);

  if (!result) {
    json(res, 503, {
      error: "no_chrome_tab",
      message: "No LinkedIn tab found in Chrome — open linkedin.com in Chrome first",
    });
    return;
  }

  if (result.error) {
    json(res, 502, { error: result.error });
    return;
  }

  json(res, 200, { posts: result.posts || [] });
}

// ── LinkedIn Comment Automation Engine ───────────────────────────────────────
// Persistent polling loop: watches posts for keyword-matched comments,
// auto-replies with the configured template. Runs entirely server-side.

const AUTOMATIONS_FILE = path.join(studioDir, ".li-automations.json");
const REPLIED_FILE     = path.join(studioDir, ".li-replied.json");

function loadAutomations() {
  try { return JSON.parse(fs.readFileSync(AUTOMATIONS_FILE, "utf8")); } catch { return []; }
}
function saveAutomations(list) {
  fs.writeFileSync(AUTOMATIONS_FILE, JSON.stringify(list, null, 2));
}
function loadReplied() {
  try { return new Set(JSON.parse(fs.readFileSync(REPLIED_FILE, "utf8"))); } catch { return new Set(); }
}
function saveReplied(set) {
  fs.writeFileSync(REPLIED_FILE, JSON.stringify([...set]));
}

const ZERNIO_KEY = process.env.VITE_ZERNIO_API_KEY || "";
const ZERNIO_BASE = process.env.VITE_ZERNIO_API_URL || "https://zernio.com/api/v1";

async function zernioGet(path_) {
  const r = await fetch(`${ZERNIO_BASE}${path_}`, {
    headers: { Authorization: `Bearer ${ZERNIO_KEY}` },
  });
  return r.json();
}
async function zernioPost(path_, body) {
  const r = await fetch(`${ZERNIO_BASE}${path_}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ZERNIO_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

function matchesKeywords(text, keywords) {
  if (!keywords || !keywords.trim()) return true;
  const kws = keywords.split(",").map(k => k.trim().toLowerCase()).filter(Boolean);
  const t = (text || "").toLowerCase();
  return kws.some(k => t.includes(k));
}

async function runAutomationCycle() {
  const automations = loadAutomations().filter(a => a.isActive);
  if (!automations.length) return;

  const replied = loadReplied();
  let changed = false;

  for (const rule of automations) {
    try {
      const data = await zernioGet(`/inbox/comments/${encodeURIComponent(rule.postId)}?accountId=${rule.accountId}`);
      const comments = data.comments || [];

      for (const c of comments) {
        const cid = c.id || c._id;
        if (!cid || replied.has(cid)) continue;
        const text = c.message || c.text || c.content || "";
        if (!matchesKeywords(text, rule.keywords)) continue;

        // Fire the reply with the actual value template
        const result = await zernioPost(`/inbox/comments/${encodeURIComponent(rule.postId)}`, {
          accountId: rule.accountId,
          commentId: cid,
          message: rule.replyTemplate,
        });

        if (result.success) {
          replied.add(cid);
          changed = true;
          process.stdout.write(`[li-automation] Replied to ${c.from?.name || cid} on post ${rule.postId}\n`);
        }
      }
    } catch (e) {
      process.stdout.write(`[li-automation] Error on rule ${rule.id}: ${e.message}\n`);
    }
  }

  if (changed) saveReplied(replied);
}

// Poll every 5 minutes
setInterval(runAutomationCycle, 5 * 60 * 1000);
// Also run immediately on start
setTimeout(runAutomationCycle, 3000);

async function handleAutomationSave(req, res) {
  let body = "";
  for await (const chunk of req) body += chunk;
  let rule;
  try { rule = JSON.parse(body); } catch {
    json(res, 400, { error: "Invalid JSON" }); return;
  }
  const automations = loadAutomations();
  const existing = automations.findIndex(a => a.id === rule.id);
  const entry = { ...rule, id: rule.id || `rule_${Date.now()}`, createdAt: rule.createdAt || new Date().toISOString() };
  if (existing >= 0) automations[existing] = entry;
  else automations.push(entry);
  saveAutomations(automations);
  json(res, 200, { success: true, automation: entry });
}

function handleAutomationList(req, res) {
  const replied = loadReplied();
  const automations = loadAutomations();
  json(res, 200, { automations, repliedCount: replied.size });
}

async function handleAutomationDelete(req, res, id) {
  const automations = loadAutomations().filter(a => a.id !== id);
  saveAutomations(automations);
  json(res, 200, { success: true });
}

// ── Static file helpers ───────────────────────────────────────────────────────

function safeResolve(requestPath) {
  const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const resolvedPath = path.resolve(distDir, relativePath);
  if (!resolvedPath.startsWith(distDir + path.sep) && resolvedPath !== path.join(distDir, "index.html")) {
    return null;
  }
  return resolvedPath;
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES.get(ext) || "application/octet-stream";
  res.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(res);
}

// ── Server ────────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === "/api/li-cookies") { await handleCookieCheck(req, res); return; }
  if (url.pathname === "/api/open-chrome-linkedin") { handleOpenChrome(req, res); return; }
  if (url.pathname === "/api/li-posts") { await handleLinkedInProxy(req, res); return; }
  if (url.pathname === "/api/li-automations" && req.method === "GET") { handleAutomationList(req, res); return; }
  if (url.pathname === "/api/li-automations" && req.method === "POST") { await handleAutomationSave(req, res); return; }
  if (url.pathname.startsWith("/api/li-automations/") && req.method === "DELETE") {
    await handleAutomationDelete(req, res, url.pathname.split("/api/li-automations/")[1]); return;
  }

  const filePath = safeResolve(url.pathname);
  if (!filePath) { res.writeHead(403); res.end("Forbidden"); return; }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) { sendFile(res, filePath); return; }
  sendFile(res, path.join(distDir, "index.html"));
});

server.listen(port, host, () => {
  process.stdout.write(`Zernio studio running at http://${host}:${port}\n`);
});
