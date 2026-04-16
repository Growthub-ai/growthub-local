/**
 * CommentRules
 *
 * TAB 1 — IG / FB  → /api/v1/comment-automations  (native Zernio automation)
 * TAB 2 — X / LinkedIn → /api/v1/inbox/comments/{platformPostId}
 *           Fetch comments → keyword match → preview → reply
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { api, PROFILE_ID } from '../api.js';
import { useApp } from '../App.jsx';

// ── helpers ────────────────────────────────────────────────────────────────
const IG_FB   = ['instagram', 'facebook'];
const XLI     = ['twitter', 'x', 'linkedin'];

/** Extract native post ID from a URL or return the raw value */
function parsePostId(raw) {
  const s = (raw || '').trim();
  // X / Twitter: https://x.com/user/status/1234567890  or  twitter.com/…
  const xm = s.match(/(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)/i);
  if (xm) return xm[1];
  // LinkedIn: extract activity ID from URL
  const lim = s.match(/activity[-:](\d+)/i);
  if (lim) return lim[1];
  // LinkedIn urn style
  const urn = s.match(/urn:li:(?:share|ugcPost):(\d+)/i);
  if (urn) return urn[1];
  return s; // assume already a raw ID
}

function matchesKeywords(text, keywords, mode) {
  if (!keywords.trim()) return true; // blank = ALL comments
  const kws = keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
  const t = (text || '').toLowerCase();
  if (mode === 'exact') return kws.some(k => t === k);
  return kws.some(k => t.includes(k));
}

const REPLIED_KEY = 'zernio_replied_comments';
function getReplied() {
  try { return new Set(JSON.parse(localStorage.getItem(REPLIED_KEY) || '[]')); } catch { return new Set(); }
}
function markReplied(id) {
  const s = getReplied(); s.add(id);
  localStorage.setItem(REPLIED_KEY, JSON.stringify([...s]));
}

// ── component ──────────────────────────────────────────────────────────────
export default function CommentRules() {
  const { accounts, showToast } = useApp();
  const [tab, setTab] = useState('xli'); // 'igfb' | 'xli'

  const igfbAccounts = accounts.filter(a => IG_FB.includes(a.platform));
  const xliAccounts  = accounts.filter(a => XLI.includes(a.platform?.toLowerCase()));

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        {[
          { id: 'xli',  label: '🐦 X / LinkedIn  (comments API)' },
          { id: 'igfb', label: '📸 Instagram / Facebook  (automation)' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '9px 18px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600,
            color: tab === t.id ? 'var(--accentl)' : 'var(--muted)',
            borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'xli'  && <XLITab  accounts={xliAccounts}  showToast={showToast} />}
      {tab === 'igfb' && <IGFBTab accounts={igfbAccounts} showToast={showToast} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: X / LinkedIn — direct comments API
// ══════════════════════════════════════════════════════════════════════════════
function XLITab({ accounts, showToast }) {
  const [accountId, setAccountId]     = useState('');
  const [postUrl, setPostUrl]         = useState('');
  const [keywords, setKeywords]       = useState('');
  const [matchMode, setMatchMode]     = useState('contains');
  const [replyTemplate, setReplyTemplate] = useState('');
  const [charCount, setCharCount]     = useState(0);

  const [fetching, setFetching]       = useState(false);
  const [comments, setComments]       = useState(null); // null = not fetched yet
  const [fetchErr, setFetchErr]       = useState('');

  const [running, setRunning]         = useState(false);
  const [results, setResults]         = useState([]); // { comment, status, error }

  // auto-select first account
  useEffect(() => {
    if (!accountId && accounts.length) setAccountId(accounts[0]._id);
  }, [accounts]);

  useEffect(() => { setCharCount(replyTemplate.length); }, [replyTemplate]);

  const platformPostId = parsePostId(postUrl);

  // ── STEP 1: Validate — fetch + preview matches ────────────────────────────
  const validate = async () => {
    if (!accountId)       { showToast('Select an account', false); return; }
    if (!postUrl.trim())  { showToast('Enter a post URL or ID', false); return; }
    if (!replyTemplate.trim()) { showToast('Enter a reply template', false); return; }

    setFetching(true);
    setFetchErr('');
    setComments(null);
    setResults([]);

    try {
      const data = await api.getComments(platformPostId, accountId);
      const all  = data.comments || data.data || [];
      setComments(all);
      if (!all.length) showToast('No comments found on this post', false);
      else showToast(`Fetched ${all.length} comment${all.length !== 1 ? 's' : ''} — preview below`);
    } catch (e) {
      setFetchErr(e.message);
      showToast(e.message, false);
    } finally {
      setFetching(false);
    }
  };

  // ── STEP 2: Run — reply to matched comments ───────────────────────────────
  const run = async () => {
    if (!comments?.length) { showToast('Validate first', false); return; }
    const matched = comments.filter(c => matchesKeywords(c.text || c.content || c.message || '', keywords, matchMode));
    if (!matched.length)   { showToast('No comments match the keywords', false); return; }

    setRunning(true);
    const replied = getReplied();
    const out = [];

    for (const c of matched) {
      const cid = c._id || c.id || c.commentId;
      if (replied.has(cid)) {
        out.push({ comment: c, status: 'skipped', error: 'Already replied' });
        continue;
      }
      try {
        await api.replyToComment(platformPostId, {
          accountId,
          commentId: cid,
          message:   replyTemplate,
        });
        markReplied(cid);
        out.push({ comment: c, status: 'replied' });
      } catch (e) {
        out.push({ comment: c, status: 'error', error: e.message });
      }
    }

    setResults(out);
    const ok = out.filter(r => r.status === 'replied').length;
    showToast(`Done — ${ok} repl${ok !== 1 ? 'ies' : 'y'} sent`);
    setRunning(false);
  };

  const matched = comments
    ? comments.filter(c => matchesKeywords(c.text || c.content || c.message || '', keywords, matchMode))
    : [];

  const acct = accounts.find(a => a._id === accountId);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 16, alignItems: 'start' }}>

      {/* ── LEFT: config ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        <div className="card">
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14 }}>Setup</div>

          <div className="field">
            <label>Account</label>
            {accounts.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--redl)', padding: '8px 0' }}>
                No X or LinkedIn accounts connected
              </div>
            ) : (
              <select className="select" value={accountId} onChange={e => setAccountId(e.target.value)}>
                {accounts.map(a => (
                  <option key={a._id} value={a._id}>
                    {a.platform === 'linkedin' ? 'LinkedIn' : 'X / Twitter'} — {a.displayName || a.username}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="field">
            <label>Post URL or ID</label>
            <input className="input"
              placeholder="https://x.com/user/status/123… or paste LinkedIn URL"
              value={postUrl} onChange={e => setPostUrl(e.target.value)} />
            {postUrl && (
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                Post ID: <code style={{ color: 'var(--accentl)' }}>{platformPostId}</code>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Keywords <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(blank = all)</span></label>
              <input className="input" placeholder="FREE, GUIDE, LINK"
                value={keywords} onChange={e => setKeywords(e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Match mode</label>
              <select className="select" value={matchMode} onChange={e => setMatchMode(e.target.value)}>
                <option value="contains">Contains</option>
                <option value="exact">Exact</option>
              </select>
            </div>
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label>Reply template</label>
            <textarea className="textarea" style={{ minHeight: 80 }}
              placeholder="Hey @{{username}}! Check this out 👉 https://..."
              value={replyTemplate} onChange={e => setReplyTemplate(e.target.value)} />
            <div className={`char-count ${charCount > 280 ? 'char-over' : ''}`}>
              {charCount} / 280 chars {acct?.platform?.toLowerCase().includes('linkedin') ? '(LinkedIn: 1250)' : '(X: 280)'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }}
              onClick={validate} disabled={fetching}>
              {fetching ? <><span className="spinner" style={{ marginRight: 7 }} />Fetching…</> : '🔍 Validate (fetch + preview)'}
            </button>
          </div>

          {comments !== null && matched.length > 0 && results.length === 0 && (
            <button className="btn btn-primary" style={{ marginTop: 8, width: '100%' }}
              onClick={run} disabled={running}>
              {running ? <><span className="spinner" style={{ marginRight: 7 }} />Replying…</> : `🚀 Run — reply to ${matched.length} matched comment${matched.length !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>

        {/* Legend */}
        <div className="card" style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
          <div style={{ fontWeight: 600, color: 'var(--dim)', marginBottom: 6 }}>How it works</div>
          <div>1. Paste your X or LinkedIn post URL</div>
          <div>2. Set keywords — comments containing them get matched</div>
          <div>3. <strong style={{ color: 'var(--dim)' }}>Validate</strong> — fetches comments, shows preview</div>
          <div>4. <strong style={{ color: 'var(--dim)' }}>Run</strong> — replies to each matched comment</div>
          <div style={{ marginTop: 6, color: '#52525b' }}>Already-replied comments are skipped (tracked locally)</div>
        </div>
      </div>

      {/* ── RIGHT: results ────────────────────────────────────────────── */}
      <div>
        {fetchErr && (
          <div className="banner banner-err" style={{ marginBottom: 12 }}>{fetchErr}</div>
        )}

        {/* After run: results table */}
        {results.length > 0 && (
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>
              Results — {results.filter(r => r.status === 'replied').length} sent · {results.filter(r => r.status === 'error').length} errors · {results.filter(r => r.status === 'skipped').length} skipped
            </div>
            {results.map((r, i) => (
              <ResultRow key={i} r={r} template={replyTemplate} />
            ))}
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }}
              onClick={() => { setResults([]); }}>Clear results</button>
          </div>
        )}

        {/* Preview: all comments with match highlight */}
        {comments !== null && results.length === 0 && (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>
                {comments.length} comment{comments.length !== 1 ? 's' : ''} fetched
                {keywords.trim() && ` · ${matched.length} match "${keywords}"`}
              </div>
              <button className="btn btn-ghost btn-xs" onClick={validate}>↻ Refresh</button>
            </div>

            {comments.length === 0 && (
              <div className="empty"><div className="empty-icon">💬</div><div className="empty-msg">No comments on this post yet.</div></div>
            )}

            {comments.map((c, i) => {
              const cid  = c._id || c.id || c.commentId;
              const text = c.text || c.content || c.message || '';
              const user = c.username || c.author || c.authorName || c.displayName || '?';
              const isMatch = matchesKeywords(text, keywords, matchMode);
              const alreadyReplied = getReplied().has(cid);

              return (
                <div key={cid || i} style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  marginBottom: 6,
                  background: isMatch ? 'rgba(124,58,237,0.08)' : 'var(--hover)',
                  border: `1px solid ${isMatch ? 'var(--accent)' : 'var(--border)'}`,
                }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>
                        @{user}
                        {c.createdAt && <span style={{ marginLeft: 8 }}>{new Date(c.createdAt).toLocaleString()}</span>}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.5 }}>{text}</div>
                      {isMatch && replyTemplate && (
                        <div style={{ marginTop: 8, padding: '7px 10px', background: 'var(--accentb)', borderRadius: 6, fontSize: 12, color: 'var(--accentl)', borderLeft: '3px solid var(--accent)' }}>
                          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>REPLY PREVIEW</div>
                          {replyTemplate.replace(/\{\{username\}\}/g, user)}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', flexShrink: 0 }}>
                      {isMatch && (
                        <span className="badge badge-purple" style={{ fontSize: 10 }}>MATCH</span>
                      )}
                      {alreadyReplied && (
                        <span className="badge badge-green" style={{ fontSize: 10 }}>REPLIED</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {comments === null && !fetching && (
          <div className="empty" style={{ marginTop: 40 }}>
            <div className="empty-icon">🔍</div>
            <div className="empty-msg">Enter a post URL and click Validate to fetch comments</div>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultRow({ r, template }) {
  const c    = r.comment;
  const text = c.text || c.content || c.message || '';
  const user = c.username || c.author || c.authorName || '?';
  const colorMap = { replied: 'var(--greenl)', error: 'var(--redl)', skipped: 'var(--muted)' };
  const iconMap  = { replied: '✓', error: '✗', skipped: '–' };

  return (
    <div style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
      <span style={{ color: colorMap[r.status], fontSize: 14, fontWeight: 700, flexShrink: 0, minWidth: 16 }}>{iconMap[r.status]}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>@{user}</div>
        <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 2 }}>{text.slice(0, 100)}</div>
        {r.status === 'replied' && (
          <div style={{ fontSize: 11, color: 'var(--accentl)', marginTop: 3 }}>
            ↩ {template.slice(0, 80)}
          </div>
        )}
        {r.error && <div style={{ fontSize: 11, color: 'var(--redl)', marginTop: 3 }}>{r.error}</div>}
      </div>
      <span style={{ fontSize: 11, color: colorMap[r.status], flexShrink: 0 }}>{r.status}</span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Instagram / Facebook — native /api/v1/comment-automations
// ══════════════════════════════════════════════════════════════════════════════
function IGFBTab({ accounts, showToast }) {
  const [automations, setAutomations] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [form, setForm]               = useState({ name: '', accountId: '', platformPostId: '', keywords: '', dmMessage: '', commentReply: '' });
  const [formOpen, setFormOpen]       = useState(false);
  const [editId, setEditId]           = useState(null);
  const [saving, setSaving]           = useState(false);
  const [deleting, setDeleting]       = useState(null);
  const [connectUrls, setConnectUrls] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.getCommentAutomations(PROFILE_ID);
      setAutomations(d.automations || []);
    } catch (e) {
      showToast(e.message, false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!PROFILE_ID) return;
    Promise.all(['instagram','facebook'].map(p =>
      api.getConnectUrl(p, PROFILE_ID).then(d => ({ p, url: d.authUrl || d.url })).catch(() => null)
    )).then(res => {
      const m = {};
      res.forEach(r => r && (m[r.p] = r.url));
      setConnectUrls(m);
    });
  }, []);

  const save = async () => {
    if (!form.name.trim() || !form.accountId || !form.platformPostId.trim() || !form.dmMessage.trim()) {
      showToast('Fill in all required fields', false); return;
    }
    setSaving(true);
    const body = { name: form.name.trim(), profileId: PROFILE_ID, accountId: form.accountId, platformPostId: form.platformPostId.trim(), dmMessage: form.dmMessage.trim() };
    if (form.keywords.trim())     body.keywords     = form.keywords.trim();
    if (form.commentReply.trim()) body.commentReply = form.commentReply.trim();
    try {
      if (editId) { await api.updateCommentAutomation(editId, body); showToast('Updated ✓'); }
      else        { await api.createCommentAutomation(body); showToast('Automation live ✓'); }
      setFormOpen(false); setEditId(null);
      load();
    } catch (e) { showToast(e.message, false); }
    finally { setSaving(false); }
  };

  const del = async (id) => {
    if (!confirm('Delete automation?')) return;
    setDeleting(id);
    try { await api.deleteCommentAutomation(id); showToast('Deleted'); load(); }
    catch (e) { showToast(e.message, false); }
    finally { setDeleting(null); }
  };

  const toggle = async (a) => {
    try { await api.updateCommentAutomation(a._id, { isActive: !a.isActive }); showToast(a.isActive ? 'Paused' : 'Activated ✓'); load(); }
    catch (e) { showToast(e.message, false); }
  };

  if (!accounts.length) return (
    <div className="card">
      <div style={{ fontWeight: 600, color: 'var(--redl)', marginBottom: 10 }}>⚠️ Connect Instagram or Facebook first</div>
      <div style={{ fontSize: 13, color: 'var(--dim)', marginBottom: 14 }}>Comment-to-DM automations require a Meta platform account.</div>
      <div style={{ display: 'flex', gap: 8 }}>
        {connectUrls.instagram && <a href={connectUrls.instagram} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">📸 Connect Instagram</a>}
        {connectUrls.facebook  && <a href={connectUrls.facebook}  target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">f Connect Facebook</a>}
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{automations.length} automation{automations.length !== 1 ? 's' : ''}</span>
        <button className="btn btn-primary btn-sm" onClick={() => { setForm({ name: '', accountId: accounts[0]?._id || '', platformPostId: '', keywords: '', dmMessage: '', commentReply: '' }); setEditId(null); setFormOpen(true); }}>+ New</button>
      </div>

      {formOpen && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14 }}>{editId ? 'Edit' : 'New'} Comment-to-DM Automation</div>
          <div className="field"><label>Name</label><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. FREE keyword — Ads Playbook" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>IG / FB Account</label>
              <select className="select" value={form.accountId} onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))}>
                {accounts.map(a => <option key={a._id} value={a._id}>{a.platform} @{a.displayName || a.username}</option>)}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Keywords (comma-sep, blank = all)</label>
              <input className="input" value={form.keywords} onChange={e => setForm(f => ({ ...f, keywords: e.target.value }))} placeholder="FREE, GUIDE" />
            </div>
          </div>
          <div className="field" style={{ marginTop: 10 }}>
            <label>Platform Post ID</label>
            <input className="input" value={form.platformPostId} onChange={e => setForm(f => ({ ...f, platformPostId: e.target.value }))} placeholder="Native IG/FB post ID" />
          </div>
          <div className="field">
            <label>DM Message <span style={{ color: 'var(--redl)' }}>*</span></label>
            <textarea className="textarea" value={form.dmMessage} onChange={e => setForm(f => ({ ...f, dmMessage: e.target.value }))} placeholder="Hey {{firstName}}! Here's your guide 👉 https://..." />
          </div>
          <div className="field">
            <label>Comment Reply (optional — public)</label>
            <input className="input" value={form.commentReply} onChange={e => setForm(f => ({ ...f, commentReply: e.target.value }))} placeholder="Check your DMs! 📩" />
          </div>
          <div className="row-end">
            <button className="btn btn-ghost btn-sm" onClick={() => setFormOpen(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : (editId ? 'Update' : '🚀 Create')}</button>
          </div>
        </div>
      )}

      {loading && <div className="loading-row"><span className="spinner" />Loading…</div>}
      {!loading && !automations.length && !formOpen && (
        <div className="empty"><div className="empty-icon">💬</div><div className="empty-msg">No automations yet</div></div>
      )}

      {automations.map(a => (
        <div key={a._id} className="card" style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{a.name}</span>
            <span className={`badge ${a.isActive ? 'badge-green' : 'badge-neutral'}`}>{a.isActive ? 'Active' : 'Paused'}</span>
            <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>{a.keywords || 'ALL COMMENTS'}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 8 }}>📩 {a.dmMessage}</div>
          {a.commentReply && <div style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 8 }}>💬 {a.commentReply}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-xs" onClick={() => toggle(a)}>{a.isActive ? 'Pause' : 'Activate'}</button>
            <button className="btn btn-ghost btn-xs" onClick={() => { setForm({ name: a.name, accountId: a.accountId, platformPostId: a.platformPostId, keywords: a.keywords || '', dmMessage: a.dmMessage, commentReply: a.commentReply || '' }); setEditId(a._id); setFormOpen(true); }}>Edit</button>
            <button className="btn btn-danger btn-xs" style={{ marginLeft: 'auto' }} onClick={() => del(a._id)} disabled={deleting === a._id}>{deleting === a._id ? '…' : 'Delete'}</button>
          </div>
        </div>
      ))}
    </div>
  );
}
