import { useState } from 'react';
import { api, PROFILE_ID } from '../api.js';
import { useApp } from '../App.jsx';

const COMMANDS = [
  { name: '/zernio campaign',  desc: 'Full campaign: brief + calendar + publishing plan + captions + optional scheduling' },
  { name: '/zernio calendar',  desc: 'Content calendar from an existing brief' },
  { name: '/zernio captions',  desc: 'Caption copy deck — batch or single platform, 3 variants A/B/C' },
  { name: '/zernio schedule',  desc: 'Scheduling manifest from an existing calendar (produces JSON for submission here)' },
  { name: '/zernio queue',     desc: 'Define or update a recurring queue (time slots)' },
  { name: '/zernio analytics', desc: 'Analytics briefing from API data or provided metrics' },
  { name: '/zernio inbox',     desc: 'Draft replies for DMs, comments, and reviews via unified inbox' },
  { name: '/zernio proposal',  desc: 'Client-ready proposal with platform mix and ROI projections' },
  { name: '/zernio platforms', desc: 'Platform coverage report for client context' },
  { name: '/zernio quick',     desc: '30-second campaign snapshot for a domain or brand' },
];

const STATUS = { pending: '⬜', busy: '🔵', ok: '✅', err: '❌' };

export default function Agent() {
  const { accounts, profile, showToast } = useApp();
  const [json, setJson]         = useState('');
  const [rows, setRows]         = useState([]);
  const [running, setRunning]   = useState(false);

  const context = `# Zernio Agent Context
Profile ID : ${PROFILE_ID || '(not set)'}
Profile    : ${profile?.name || '—'}
Timezone   : ${profile?.timezone || 'America/New_York'}
API Base   : https://zernio.com/api/v1

## Connected Accounts
${accounts.map(a => `- ${a.platform} | @${a.username} | accountId: ${a._id || a.accountId}`).join('\n') || '(none)'}

## Usage
Paste a /zernio schedule manifest below and click Submit to push each post to Zernio.
Or run any /zernio command in Claude with this context block prepended.`;

  const parse = () => {
    try {
      const parsed = JSON.parse(json);
      const posts = parsed?.zernioSchedulingManifest?.posts
        || parsed?.posts
        || (Array.isArray(parsed) ? parsed : null);
      if (!posts?.length) throw new Error('No posts array found. Expected { zernioSchedulingManifest: { posts: [...] } }');
      return posts;
    } catch (e) {
      showToast(e.message, false);
      return null;
    }
  };

  const submit = async () => {
    const posts = parse();
    if (!posts) return;
    setRows(posts.map(p => ({ id: p.clientPostId || p.id || Math.random(), label: (p.content || '').slice(0, 60) + '…', status: 'pending', msg: '' })));
    setRunning(true);

    for (let i = 0; i < posts.length; i++) {
      const p = posts[i];
      setRows(r => r.map((row, j) => j === i ? { ...row, status: 'busy' } : row));
      try {
        const ikey = p.clientPostId || `agent-${Date.now()}-${i}`;
        const body = {
          profileId: p.profileId || PROFILE_ID,
          content:   p.content,
          platforms: p.platforms,
        };
        if (p.scheduledFor) body.scheduledFor = p.scheduledFor;
        if (p.queueId)      body.queueId      = p.queueId;
        if (p.media?.length) body.media       = p.media;
        if (p.timezone)     body.timezone     = p.timezone;

        const res = await api.createPost(body, ikey);
        const resId = res.id || res._id || 'ok';
        setRows(r => r.map((row, j) => j === i ? { ...row, status: 'ok', msg: `ID: ${resId}` } : row));
        await new Promise(res => setTimeout(res, 400));
      } catch (e) {
        setRows(r => r.map((row, j) => j === i ? { ...row, status: 'err', msg: e.message } : row));
      }
    }

    setRunning(false);
    showToast('Manifest submission complete');
  };

  const clear = () => { setJson(''); setRows([]); };

  const okCount  = rows.filter(r => r.status === 'ok').length;
  const errCount = rows.filter(r => r.status === 'err').length;

  return (
    <div className="agent-layout">
      <div className="cmd-ref">
        <div className="section-title mb16">Command Reference</div>
        {COMMANDS.map(c => (
          <div key={c.name} className="cmd-item">
            <div className="cmd-name">{c.name}</div>
            <div className="cmd-desc">{c.desc}</div>
          </div>
        ))}

        <hr className="divider" />
        <div className="section-title mb8">Agent Context Block</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Prepend to any Claude prompt</div>
        <div className="context-box">{context}</div>
        <button
          className="btn btn-ghost btn-sm mt8"
          style={{ width: '100%' }}
          onClick={() => { navigator.clipboard.writeText(context); showToast('Copied to clipboard ✓'); }}
        >
          Copy Context
        </button>
      </div>

      <div className="manifest-panel">
        <div className="card">
          <div className="section-title mb12">Manifest Submitter</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
            Paste the JSON output from <span style={{ fontFamily: 'monospace', color: 'var(--accentl)' }}>/zernio schedule</span> and submit each post directly to the Zernio API.
          </div>
          <div className="field">
            <label>Scheduling Manifest JSON</label>
            <textarea
              className="textarea"
              style={{ minHeight: 200, fontFamily: 'monospace', fontSize: 12 }}
              placeholder={'{\n  "zernioSchedulingManifest": {\n    "posts": [...]\n  }\n}'}
              value={json}
              onChange={e => setJson(e.target.value)}
            />
          </div>
          <div className="row-end">
            <button className="btn btn-ghost btn-sm" onClick={clear}>Clear</button>
            <button className="btn btn-secondary btn-sm" onClick={() => { const p = parse(); if (p) showToast(`${p.length} post(s) parsed — ready to submit`); }}>
              Validate
            </button>
            <button className="btn btn-primary" onClick={submit} disabled={running || !json.trim()}>
              {running ? <><span className="spinner" style={{ marginRight: 7 }} />Submitting…</> : 'Submit Manifest'}
            </button>
          </div>
        </div>

        {rows.length > 0 && (
          <div className="card">
            <div className="row mb12" style={{ justifyContent: 'space-between' }}>
              <div className="section-title" style={{ marginBottom: 0 }}>Submission Progress</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {okCount}/{rows.length} ok {errCount > 0 && <span style={{ color: 'var(--redl)' }}>· {errCount} failed</span>}
              </div>
            </div>
            <div className="manifest-status">
              {rows.map((row, i) => (
                <div key={i} className={`m-row ${row.status}`}>
                  <span style={{ fontSize: 16 }}>{STATUS[row.status]}</span>
                  <span className="flex1" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.label}
                  </span>
                  {row.msg && <span style={{ fontSize: 11, opacity: 0.8 }}>{row.msg}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
