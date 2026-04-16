import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

// ── Chrome local cookie reader (same logic as serve.mjs) ─────────────────────

const CHROME_BASE = path.join(os.homedir(), 'Library/Application Support/Google/Chrome');
const CHROME_PROFILES = ['Profile 7', 'Profile 1', 'Default', 'Profile 2', 'Profile 3', 'Profile 4', 'Profile 5', 'Profile 6'];

function findChromeCookieDb() {
  for (const profile of CHROME_PROFILES) {
    const dbPath = path.join(CHROME_BASE, profile, 'Cookies');
    if (!fs.existsSync(dbPath)) continue;
    const tmp = path.join(os.tmpdir(), `gh_li_${profile.replace(' ', '_')}.db`);
    try { fs.copyFileSync(dbPath, tmp); } catch { continue; }
    const check = spawnSync('sqlite3', [tmp,
      "SELECT count(*) FROM cookies WHERE host_key LIKE '%linkedin%' AND name='li_at';"
    ], { encoding: 'utf8' });
    if (check.stdout.trim() === '1') return tmp;
  }
  return null;
}

function getChromeDecryptionKey() {
  const r = spawnSync('security', [
    'find-generic-password', '-w', '-a', 'Chrome', '-s', 'Chrome Safe Storage'
  ], { encoding: 'utf8' });
  if (r.status !== 0 || !r.stdout.trim()) return null;
  return crypto.pbkdf2Sync(r.stdout.trim(), 'saltysalt', 1003, 16, 'sha1');
}

function decryptChromeValue(hexVal, key) {
  try {
    const encBuf = Buffer.from(hexVal, 'hex');
    const iv = Buffer.alloc(16, ' ');
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, encBuf.slice(3));
    // wrong — iv is separate
    const d2 = crypto.createDecipheriv('aes-128-cbc', key, iv);
    return Buffer.concat([d2.update(encBuf.slice(3)), d2.final()]).toString('utf8');
  } catch { return null; }
}

function readLinkedInCookiesFromChrome() {
  const dbPath = findChromeCookieDb();
  if (!dbPath) return null;
  const key = getChromeDecryptionKey();
  if (!key) return null;
  const result = spawnSync('sqlite3', [dbPath,
    "SELECT name, hex(encrypted_value) FROM cookies WHERE host_key LIKE '%linkedin%' AND name IN ('li_at','JSESSIONID');"
  ], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  const cookies = {};
  for (const line of result.stdout.trim().split('\n')) {
    if (!line) continue;
    const [name, hexVal] = line.split('|');
    if (!name || !hexVal) continue;
    const val = decryptChromeValue(hexVal, key);
    if (val) cookies[name] = val;
  }
  return cookies.li_at ? cookies : null;
}

function normalizeLiPosts(data) {
  const elements = data?.elements || data?.data?.elements || [];
  return elements.map(el => {
    const update = el?.value?.['com.linkedin.voyager.feed.render.UpdateV2'] || {};
    const text = update?.commentary?.text?.text || '';
    const meta = update?.updateMetadata || {};
    const urn = meta?.urn || '';
    const permalink = meta?.updateActions?.permalink ||
      (urn ? `https://www.linkedin.com/feed/update/${encodeURIComponent(urn)}/` : '');
    const activityId = urn.replace(/^urn:li:(activity|share):/, '');
    const social = update?.socialDetail?.totalSocialActivityCounts || {};
    return { id: activityId, platform: 'linkedin', message: text, permalink,
      commentCount: social.numComments ?? 0, likeCount: social.numLikes ?? 0,
      createdTime: new Date().toISOString(), mediaType: null, picture: null, _fromVoyager: true };
  }).filter(p => p.id && p.message);
}

function linkedInProxyPlugin() {
  return {
    name: 'linkedin-voyager-proxy',
    configureServer(server) {
      server.middlewares.use('/api/li-cookies', (_req, res) => {
        const cookies = readLinkedInCookiesFromChrome();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({ found: !!cookies }));
      });

      server.middlewares.use('/api/open-chrome-linkedin', (_req, res) => {
        spawnSync('open', ['-a', 'Google Chrome', 'https://www.linkedin.com/login']);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ opened: true }));
      });

      server.middlewares.use('/api/li-posts', async (req, res) => {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' });
          res.end(); return;
        }
        let body = '';
        for await (const chunk of req) body += chunk;
        let username;
        try { ({ username } = JSON.parse(body)); } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' })); return;
        }
        const cookies = readLinkedInCookiesFromChrome();
        if (!cookies) {
          res.writeHead(401, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: 'no_session', message: 'LinkedIn session not found in Chrome' })); return;
        }
        const { li_at, JSESSIONID: jsessionid } = cookies;
        const csrf = decodeURIComponent(jsessionid).replace(/^["']|["']$/g, '');
        const liUrl = `https://www.linkedin.com/voyager/api/identity/profileUpdatesV2?profileId=${encodeURIComponent(username)}&moduleKey=memberDashRecentActivity&count=20`;
        let liRes;
        try {
          liRes = await fetch(liUrl, {
            headers: {
              Accept: 'application/vnd.linkedin.normalized+json+2.1',
              Cookie: `li_at=${li_at}; JSESSIONID=${jsessionid}`,
              'csrf-token': csrf, 'x-li-lang': 'en_US',
              'x-restli-protocol-version': '2.0.0',
              'x-li-track': JSON.stringify({ clientVersion: '1.13.13', mpVersion: '1.13.13', osName: 'web', timezoneOffset: 0, timezone: 'UTC', deviceFormFactor: 'DESKTOP', mpName: 'voyager-web' }),
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              Referer: `https://www.linkedin.com/in/${username}/recent-activity/all/`,
            },
          });
        } catch (e) {
          res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: e.message })); return;
        }
        const data = await liRes.json().catch(() => ({}));
        if (liRes.status === 401 || liRes.status === 403) {
          res.writeHead(401, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: 'session_expired', message: 'LinkedIn session expired — log in to LinkedIn in Chrome again' })); return;
        }
        if (!liRes.ok) {
          res.writeHead(liRes.status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: `LinkedIn ${liRes.status}`, raw: data })); return;
        }
        const posts = normalizeLiPosts(data);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ posts }));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), linkedInProxyPlugin()],
  server: { port: 5173, open: true },
});
