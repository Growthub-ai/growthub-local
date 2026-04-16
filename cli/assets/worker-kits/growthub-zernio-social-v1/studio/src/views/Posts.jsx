/**
 * Posts — loads real published posts from all connected accounts
 * via GET /api/v1/accounts/{accountId}/posts
 *
 * Each card has an "Automate" button that opens a full automation
 * creation modal. Automation configs are persisted to localStorage
 * and backed by a Sequences API record.
 *
 * Automation execution: POST /api/v1/inbox/comments/{postId}
 * with { accountId, commentId, message }
 */
import { useState, useEffect, useCallback } from 'react';
import { api, PROFILE_ID } from '../api.js';
import { useApp } from '../App.jsx';


// ── LinkedIn manual posts (stored locally) ────────────────────────────────
const LI_POSTS_KEY = 'zernio_manual_li_posts';
function loadManualPosts() {
  try { return JSON.parse(localStorage.getItem(LI_POSTS_KEY) || '[]'); } catch { return []; }
}
function saveManualPost(post) {
  const all = loadManualPosts().filter(p => p.id !== post.id);
  localStorage.setItem(LI_POSTS_KEY, JSON.stringify([post, ...all]));
}
function deleteManualPost(id) {
  const all = loadManualPosts().filter(p => p.id !== id);
  localStorage.setItem(LI_POSTS_KEY, JSON.stringify(all));
}
function parseLinkedInUrl(url) {
  // https://www.linkedin.com/posts/user_slug-activity-7318027571060617216-xxxx
  const m = url.match(/activity[-:](\d+)/i);
  if (m) return m[1];
  // urn:li:share:XXXX or urn:li:ugcPost:XXXX
  const urn = url.match(/urn:li:(?:share|ugcPost):(\d+)/i);
  if (urn) return urn[1];
  // raw numeric ID
  if (/^\d+$/.test(url.trim())) return url.trim();
  return null;
}

// ── localStorage helpers ───────────────────────────────────────────────────
const STORE_KEY = 'zernio_post_automations';

function loadAutomations() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { return {}; }
}
function saveAutomation(postId, config) {
  const all = loadAutomations();
  all[postId] = config;
  localStorage.setItem(STORE_KEY, JSON.stringify(all));
}
function deleteAutomation(postId) {
  const all = loadAutomations();
  delete all[postId];
  localStorage.setItem(STORE_KEY, JSON.stringify(all));
}

const REPLIED_KEY = 'zernio_replied_comments';
function getReplied() {
  try { return new Set(JSON.parse(localStorage.getItem(REPLIED_KEY) || '[]')); } catch { return new Set(); }
}
function markReplied(id) {
  const s = getReplied(); s.add(id);
  localStorage.setItem(REPLIED_KEY, JSON.stringify([...s]));
}

// ── time helper ────────────────────────────────────────────────────────────
function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h !== 1 ? 's' : ''} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d !== 1 ? 's' : ''} ago`;
}

const PLT_COLOR = { twitter: '#1d9bf0', x: '#1d9bf0', linkedin: '#0a66c2', instagram: '#e1306c', facebook: '#1877f2' };
const PLT_LABEL = { twitter: 'X', x: 'X', linkedin: 'LinkedIn', instagram: 'Instagram', facebook: 'Facebook' };

function matchesKeywords(text, keywords) {
  if (!keywords?.trim()) return true;
  const kws = keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
  const t = (text || '').toLowerCase();
  return kws.some(k => t.includes(k));
}

// ── main component ─────────────────────────────────────────────────────────
export default function Posts() {
  const { accounts, showToast } = useApp();

  const [posts, setPosts]           = useState([]);
  const [accountStates, setAccountStates] = useState({}); // { accountId: 'ok' | 'empty' | 'error' | 'loading' }
  const [loading, setLoading]       = useState(true);
  const [view, setView]             = useState('list'); // 'list' | 'calendar'
  const [filterAcct, setFilterAcct] = useState('all');

  const [automatePost, setAutomatePost]   = useState(null);
  const [savedAutomations, setSavedAutomations] = useState(loadAutomations());
  const [serverAutomations, setServerAutomations] = useState([]);
  const [manualPosts, setManualPosts]     = useState(loadManualPosts());

  // Export modal state
  const [exportPost, setExportPost]       = useState(null);
  const [exportComments, setExportComments] = useState([]);
  const [exportLoading, setExportLoading]   = useState(false);

  // Post detail expand
  const [expanded, setExpanded] = useState({});

  // Auto-fetch LinkedIn posts from Chrome on load
  const fetchLinkedInPosts = useCallback(async (fsdUrn) => {
    if (!fsdUrn) return;
    try {
      const d = await api.getLinkedInProfilePosts(fsdUrn);
      const fetched = d.posts || [];
      for (const p of fetched) saveManualPost(p);
      if (fetched.length) setManualPosts(loadManualPosts());
    } catch {}
  }, []);

  const load = useCallback(async () => {
    if (!accounts.length) { setLoading(false); return; }
    setLoading(true);
    const states = {};
    const results = await Promise.allSettled(
      accounts.map(async a => {
        try {
          const d = await api.getAccountPosts(a._id, 50);
          const acctPosts = (d.posts || []).map(p => ({ ...p, accountId: a._id, accountName: a.displayName || a.username }));
          states[a._id] = acctPosts.length > 0 ? 'ok' : 'empty';
          return acctPosts;
        } catch {
          states[a._id] = 'error';
          return [];
        }
      })
    );
    const all = results.flatMap(r => r.value || []);
    all.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
    setPosts(all);
    setAccountStates(states);
    setLoading(false);
  }, [accounts]);

  useEffect(() => { load(); }, [load]);

  // Load server-side saved automations
  useEffect(() => {
    fetch('/api/li-automations')
      .then(r => r.json())
      .then(d => {
        const rules = d.automations || [];
        setServerAutomations(rules);
        // Merge into localStorage so post cards show ✓ Automated badge
        if (rules.length) {
          const local = loadAutomations();
          rules.forEach(rule => {
            if (!local[rule.postId]) {
              local[rule.postId] = {
                name: rule.name, keywords: rule.keywords,
                dmTemplates: [rule.replyTemplate], replyTemplate: rule.replyTemplate,
                replyTemplateNC: rule.replyTemplate, postId: rule.postId,
                accountId: rule.accountId, platform: rule.platform,
                permalink: rule.permalink, status: rule.isActive ? 'active' : 'paused',
                createdAt: rule.createdAt, repliedCount: rule.repliedCount || 0,
              };
            }
          });
          localStorage.setItem('zernio_post_automations', JSON.stringify(local));
          setSavedAutomations(local);
        }
      })
      .catch(() => {});
  }, []);

  // Silently resolve LinkedIn session + pull posts on mount
  // Falls back to env-stored fsdUrn when Chrome session check fails
  const ENV_FSD_URN = import.meta.env.VITE_LI_FSD_URN || '';
  useEffect(() => {
    api.checkLinkedInSession()
      .then(d => {
        const urn = d.fsdUrn || ENV_FSD_URN;
        if (urn) fetchLinkedInPosts(urn);
      })
      .catch(() => {
        if (ENV_FSD_URN) fetchLinkedInPosts(ENV_FSD_URN);
      });
  }, [fetchLinkedInPosts]);

  // Merge API posts + LinkedIn posts from Chrome
  const liAccount = accounts.find(a => a.platform?.toLowerCase() === 'linkedin');
  const manualWithAcct = manualPosts.map(p => ({ ...p, accountId: liAccount?._id || 'manual', accountName: liAccount?.displayName || 'LinkedIn' }));
  const allPosts = [...posts, ...manualWithAcct];
  const visible = filterAcct === 'all' ? allPosts : allPosts.filter(p => p.accountId === filterAcct);

  const openExport = async (post) => {
    setExportPost(post);
    setExportComments([]);
    setExportLoading(true);
    try {
      const d = await api.getComments(post.id, post.accountId);
      setExportComments(d.comments || []);
    } catch (e) {
      showToast(e.message, false);
    } finally {
      setExportLoading(false);
    }
  };

  const onAutomationSaved = (postId, config) => {
    saveAutomation(postId, config);
    setSavedAutomations(loadAutomations());
    setAutomatePost(null);
    showToast('Automation launched ✓');
  };

  return (
    <div>
      {/* ── toolbar ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          {[['list','☰ List'], ['calendar','📅 Calendar']].map(([v, l]) => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '6px 14px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: view === v ? 'var(--accent)' : 'transparent',
              color: view === v ? '#fff' : 'var(--muted)',
            }}>{l}</button>
          ))}
        </div>

        <select className="select" style={{ width: 200 }} value={filterAcct} onChange={e => setFilterAcct(e.target.value)}>
          <option value="all">All accounts</option>
          {accounts.map(a => (
            <option key={a._id} value={a._id}>{PLT_LABEL[a.platform] || a.platform} — {a.displayName || a.username}</option>
          ))}
        </select>

        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>
          {loading ? 'Loading…' : `${visible.length} post${visible.length !== 1 ? 's' : ''}`}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={load}>↻</button>
      </div>

      {/* ── loading ──────────────────────────────────────────────────── */}
      {loading && <div className="loading-row"><span className="spinner" />Loading posts from connected accounts…</div>}


      {/* ── LIST VIEW ────────────────────────────────────────────────── */}
      {!loading && view === 'list' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.map(post => (
            <PostCard
              key={`${post.accountId}-${post.id}`}
              post={post}
              expanded={expanded[post.id]}
              onToggleExpand={() => setExpanded(e => ({ ...e, [post.id]: !e[post.id] }))}
              hasAutomation={!!savedAutomations[post.id]}
              automationData={savedAutomations[post.id]}
              onAutomate={() => setAutomatePost(post)}
              onExportComments={() => openExport(post)}
              showToast={showToast}
            />
          ))}
        </div>
      )}

      {/* ── CALENDAR VIEW ────────────────────────────────────────────── */}
      {!loading && view === 'calendar' && (
        <CalendarView
          posts={visible}
          savedAutomations={savedAutomations}
          onAutomate={p => setAutomatePost(p)}
          showToast={showToast}
        />
      )}

      {/* ── AUTOMATE MODAL ───────────────────────────────────────────── */}
      {automatePost && (
        <AutomateModal
          post={automatePost}
          existing={savedAutomations[automatePost.id]}
          onSave={onAutomationSaved}
          onClose={() => setAutomatePost(null)}
          showToast={showToast}
          accounts={accounts}
        />
      )}

      {/* ── EXPORT COMMENTS MODAL ────────────────────────────────────── */}
      {exportPost && (
        <ExportModal
          post={exportPost}
          comments={exportComments}
          loading={exportLoading}
          onClose={() => setExportPost(null)}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Post Card
// ══════════════════════════════════════════════════════════════════════════════
function PostCard({ post, expanded, onToggleExpand, hasAutomation, automationData, onAutomate, onExportComments, showToast }) {
  const plt   = post.platform?.toLowerCase();
  const color = PLT_COLOR[plt] || '#7c3aed';
  const label = PLT_LABEL[plt] || post.platform;
  const text  = post.message || '';
  const SHORT = 160;
  const isLong = text.length > SHORT;

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
      borderLeft: `3px solid ${color}`, overflow: 'hidden',
    }}>
      {/* Top badge row */}
      <div style={{ padding: '10px 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700,
          background: 'rgba(124,58,237,0.15)', color: 'var(--accentl)',
          padding: '3px 10px', borderRadius: 20, border: '1px solid rgba(124,58,237,0.3)',
        }}>
          ⚡ Ready to automate
        </span>
        {hasAutomation && (
          <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--greenb)', color: 'var(--greenl)', padding: '3px 10px', borderRadius: 20, border: '1px solid #166534' }}>
            ✓ Automated
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>{timeAgo(post.createdTime)}</span>
      </div>

      {/* Content + image */}
      <div style={{ padding: '10px 16px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {expanded || !isLong ? text : text.slice(0, SHORT) + '…'}
          </div>
          {isLong && (
            <button onClick={onToggleExpand} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accentl)', fontSize: 12, marginTop: 4, padding: 0 }}>
              {expanded ? 'see less' : '...see more'}
            </button>
          )}
        </div>
        {post.picture && (
          <img src={post.picture} alt="" style={{ width: 64, height: 64, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
        )}
      </div>

      {/* Stats row */}
      <div style={{ padding: '0 16px 10px', display: 'flex', gap: 20, fontSize: 12, color: 'var(--muted)' }}>
        <span>👁 — impressions</span>
        <span>💬 {post.commentCount ?? 0} comments</span>
        <span>♡ {post.likeCount ?? 0} reactions</span>
        <span>↺ — reposts</span>
      </div>

      {/* Actions */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <a href={post.permalink} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>
          ↗ View on {label}
        </a>
        <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={onExportComments}>
          💬 Export Comments
        </button>
        <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>
          ♡ Export Reactions
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {hasAutomation && (
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              ✦ Assisted
            </span>
          )}
          <button
            className="btn btn-primary btn-sm"
            onClick={onAutomate}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
          >
            ⚡ {hasAutomation ? 'Edit Automation' : 'Automate'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Calendar View
// ══════════════════════════════════════════════════════════════════════════════
function CalendarView({ posts, savedAutomations, onAutomate }) {
  const grouped = {};
  posts.forEach(p => {
    const day = new Date(p.createdTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(p);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {Object.entries(grouped).map(([day, dayPosts]) => (
        <div key={day}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, padding: '0 4px' }}>
            {day}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {dayPosts.map(p => (
              <div key={p.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 12, alignItems: 'center' }}>
                {p.picture && <img src={p.picture} alt="" style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: 'var(--dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.message}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                    {PLT_LABEL[p.platform] || p.platform} · {p.commentCount ?? 0} comments · {p.likeCount ?? 0} likes
                  </div>
                </div>
                {savedAutomations[p.id] && (
                  <span style={{ fontSize: 10, background: 'var(--greenb)', color: 'var(--greenl)', padding: '2px 8px', borderRadius: 20, flexShrink: 0 }}>Automated</span>
                )}
                <button className="btn btn-primary btn-xs" onClick={() => onAutomate(p)}>⚡ Automate</button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Automate Modal — full form as per design
// ══════════════════════════════════════════════════════════════════════════════
function AutomateModal({ post, existing, onSave, onClose, showToast, accounts }) {
  const plt = post.platform?.toLowerCase();

  const [name, setName]               = useState(existing?.name || `${PLT_LABEL[plt] || post.platform} Automation — ${new Date(post.createdTime).toLocaleDateString()}`);
  const [keywords, setKeywords]       = useState(existing?.keywords || '');
  const [dmTemplates, setDmTemplates] = useState(existing?.dmTemplates || ['']);
  const [replyTemplate, setReplyTemplate]     = useState(existing?.replyTemplate || 'hey {{firstName}}! Thanks for commenting on my recent post.');
  const [replyTemplateNC, setReplyTemplateNC] = useState(existing?.replyTemplateNC || 'hey {{firstName}}! Thanks for commenting on my recent post.');

  const [autoConnect, setAutoConnect]   = useState(existing?.autoConnect || false);
  const [autoLike, setAutoLike]         = useState(existing?.autoLike || false);
  const [partialEngage, setPartialEngage] = useState(existing?.partialEngage || false);
  const [linkTracking, setLinkTracking] = useState(existing?.linkTracking || false);
  const [followUpDm, setFollowUpDm]     = useState(existing?.followUpDm || false);
  const [repostDm, setRepostDm]         = useState(existing?.repostDm || false);

  const [running, setRunning]   = useState(false);
  const [saving, setSaving]     = useState(false);

  // Variable insertion helper
  const vars = plt === 'linkedin'
    ? [['{{firstName}} (@mention)', '{{firstName}} '], ['{{fullName}} (@mention)', '{{fullName}} '], ['{{firstName}}', '{{firstName}}'], ['{{fullName}}', '{{fullName}}'], ['LinkedIn Username', '{{username}}']]
    : [['First Name', '{{firstName}}'], ['Full Name', '{{fullName}}'], ['Username', '@{{username}}']];

  function insertVar(v, setter) {
    setter(prev => prev + v);
  }

  const buildConfig = (status = 'active') => ({
    name, keywords, dmTemplates, replyTemplate, replyTemplateNC,
    autoConnect, autoLike, partialEngage, linkTracking, followUpDm, repostDm,
    postId: post.id, accountId: post.accountId, platform: post.platform,
    permalink: post.permalink, status,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const launch = async () => {
    if (!name.trim()) { showToast('Enter a name', false); return; }
    if (!dmTemplates.some(t => t.trim())) { showToast('Add at least one DM template', false); return; }
    setRunning(true);
    try {
      // Create a Sequences record in Zernio for tracking
      await api.createSequence({ name, profileId: PROFILE_ID, platform: post.platform });
      onSave(post.id, buildConfig('active'));
    } catch (e) {
      // Sequences creation failure is non-blocking — still save locally
      console.warn('Sequences API:', e.message);
      onSave(post.id, buildConfig('active'));
    } finally {
      setRunning(false);
    }
  };

  const saveDraft = async () => {
    setSaving(true);
    onSave(post.id, buildConfig('draft'));
    setSaving(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '24px 16px' }}>
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, width: '100%', maxWidth: 760, marginBottom: 24 }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Create New Automation</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{PLT_LABEL[plt]} · {(post.message || '').slice(0, 60)}…</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 0 }}>

          {/* Name + post URL */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Name your Automation <span style={{ color: 'var(--redl)' }}>*</span></label>
              <input className="input" placeholder="Enter custom name" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>{PLT_LABEL[plt]} Post URL</label>
              <input className="input" value={post.permalink} readOnly style={{ color: 'var(--muted)' }} />
            </div>
          </div>

          {/* Keywords */}
          <div className="field" style={{ marginBottom: 20 }}>
            <label>Specific Keyword to be Commented <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>(not case-sensitive)</span></label>
            <input className="input" placeholder="Enter one or more keywords, separated with comma or Enter…" value={keywords} onChange={e => setKeywords(e.target.value)} />
            <div style={{ fontSize: 11, color: 'var(--accentl)', marginTop: 4 }}>Leave blank if you want to respond to all comments.</div>
          </div>

          {/* DM Templates */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>DM Templates</div>
            {dmTemplates.map((tpl, i) => (
              <div key={i} style={{ position: 'relative', marginBottom: 8 }}>
                <textarea className="textarea" style={{ minHeight: 80, paddingRight: 36 }}
                  placeholder={`Enter DM Template ${i + 1}…`}
                  value={tpl}
                  onChange={e => setDmTemplates(prev => prev.map((t, j) => j === i ? e.target.value : t))}
                />
                {dmTemplates.length > 1 && (
                  <button onClick={() => setDmTemplates(prev => prev.filter((_, j) => j !== i))}
                    style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>×</button>
                )}
              </div>
            ))}
            <button onClick={() => setDmTemplates(prev => [...prev, ''])} style={{ width: '100%', padding: '9px', background: 'none', border: '1px dashed var(--border)', borderRadius: 6, cursor: 'pointer', color: 'var(--accentl)', fontSize: 12, fontWeight: 600 }}>
              + Add DM Template Variation
            </button>
          </div>

          {/* Variable insertion */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {vars.map(([label, val]) => (
                <button key={label} onClick={() => setDmTemplates(prev => prev.map((t, i) => i === prev.length - 1 ? t + val : t))}
                  style={{ padding: '6px 14px', background: 'var(--active)', border: 'none', borderRadius: 20, cursor: 'pointer', fontSize: 11, color: 'var(--dim)' }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>Click the buttons above to insert variables into DM and reply templates.</div>
          </div>

          {/* Reply Template */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Reply Templates <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--muted)' }}>(Reply that is sent to the comment when a DM is sent)</span></div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(124,58,237,0.08)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', marginBottom: 6 }}>
              <input className="input" style={{ flex: 1, background: 'transparent', border: 'none', padding: 0 }} value={replyTemplate} onChange={e => setReplyTemplate(e.target.value)} />
              <span style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap' }}>Auto-added most recently used replies</span>
              <button onClick={() => setReplyTemplate('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>×</button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" style={{ flex: 1 }} placeholder="Enter a new reply template… (Press Enter to save)" onKeyDown={e => { if (e.key === 'Enter') setReplyTemplate(e.target.value); }} />
              <button className="btn btn-ghost btn-sm">Save</button>
            </div>
          </div>

          {/* Reply Template Non-Connections */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Reply Templates for Non-Connections <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--muted)' }}>(When we can't send a DM)</span></div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(124,58,237,0.08)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px' }}>
              <input className="input" style={{ flex: 1, background: 'transparent', border: 'none', padding: 0 }} value={replyTemplateNC} onChange={e => setReplyTemplateNC(e.target.value)} />
              <span style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap' }}>Auto-added most recently used replies</span>
              <button onClick={() => setReplyTemplateNC('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>×</button>
            </div>
          </div>

          {/* Engagement Settings */}
          <Section icon="⚙️" title="Engagement Settings">
            <Checkbox label="Auto-Connect" checked={autoConnect} onChange={setAutoConnect} />
            <Checkbox label="Auto-Like" checked={autoLike} onChange={setAutoLike} />
            <Checkbox label="Partially Engage" checked={partialEngage} onChange={setPartialEngage} />
          </Section>

          {/* Links & Pages */}
          <Section icon="🔗" title="Links & Pages">
            <Toggle label="Link Tracking" sub="Track links clicks in your DMs" checked={linkTracking} onChange={setLinkTracking} />
            <div style={{ padding: '10px 14px', background: 'var(--hover)', borderRadius: 6, opacity: linkTracking ? 1 : 0.45 }}>
              <Toggle label="Use Pages" badge="requires link tracking" sub="Enable pages to create quiz funnels and add email gating to your links" checked={false} onChange={() => {}} disabled={!linkTracking} />
            </div>
          </Section>

          {/* Follow-ups */}
          <Section icon="📨" title="Follow-ups">
            <Checkbox label="Enable Follow-up DM" checked={followUpDm} onChange={setFollowUpDm} />
          </Section>

          {/* Repost DM */}
          <Section icon="🔁" title={<span>Repost DM <span style={{ fontSize: 10, background: 'var(--greenb)', color: 'var(--greenl)', padding: '1px 8px', borderRadius: 20, marginLeft: 4 }}>Apex</span></span>}>
            <Checkbox label="Enable Repost-specific DM" checked={repostDm} onChange={setRepostDm} />
          </Section>

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-ghost" onClick={saveDraft} disabled={saving}>
              {saving ? '…' : '📄 Save as Draft'}
            </button>
            <button className="btn btn-primary" onClick={launch} disabled={running} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {running ? <><span className="spinner" style={{ marginRight: 6 }} />Launching…</> : '⚡ Launch Automation'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ icon, title, children }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', marginBottom: 10 }}>
      <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--dim)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        {icon} {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  );
}

function Checkbox({ label, checked, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--dim)' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }} />
      {label}
    </label>
  );
}

function Toggle({ label, badge, sub, checked, onChange, disabled }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <div style={{ fontSize: 13, color: 'var(--dim)', display: 'flex', alignItems: 'center', gap: 6 }}>
          {label}
          {badge && <span style={{ fontSize: 10, color: 'var(--muted)' }}>{badge}</span>}
        </div>
        {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
      </div>
      <div onClick={() => !disabled && onChange(!checked)} style={{
        width: 36, height: 20, borderRadius: 10, background: checked ? 'var(--accent)' : 'var(--active)',
        position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0, transition: 'background 0.15s',
      }}>
        <div style={{
          position: 'absolute', top: 3, left: checked ? 19 : 3, width: 14, height: 14,
          borderRadius: '50%', background: '#fff', transition: 'left 0.15s',
        }} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Export Comments Modal
// ══════════════════════════════════════════════════════════════════════════════
function ExportModal({ post, comments, loading, onClose }) {
  const download = () => {
    const csv = ['id,username,message,createdTime,likeCount,replyCount',
      ...comments.map(c => `"${c.id}","${c.from?.username || ''}","${(c.message||'').replace(/"/g,'""')}","${c.createdTime}","${c.likeCount}","${c.replyCount}"`)
    ].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `comments-${post.id}.csv`;
    a.click();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Comments ({comments.length})</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {!loading && comments.length > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={download}>↓ Export CSV</button>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18 }}>×</button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px' }}>
          {loading && <div className="loading-row"><span className="spinner" />Loading…</div>}
          {!loading && !comments.length && <div className="empty"><div className="empty-msg">No comments yet</div></div>}
          {comments.map((c, i) => (
            <div key={c.id || i} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                {c.from?.picture && <img src={c.from.picture} alt="" style={{ width: 24, height: 24, borderRadius: '50%' }} />}
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--dim)' }}>@{c.from?.username || c.from?.name || '?'}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>{timeAgo(c.createdTime)}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 1.5 }}>{c.message}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>♡ {c.likeCount ?? 0} · replies {c.replyCount ?? 0}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
