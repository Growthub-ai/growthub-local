/**
 * CommentRules — live /api/v1/comment-automations
 *
 * Real Zernio API shape (from docs):
 *   POST /api/v1/comment-automations
 *   { name, profileId, accountId, platformPostId,
 *     keywords?,       // comma-separated string — omit to trigger on ALL comments
 *     dmMessage,       // required — private DM sent to commenter
 *     commentReply?,   // optional — public reply to the comment
 *     isActive?        // default true
 *   }
 *
 * Constraint: Instagram and Facebook ONLY.
 * Other platforms → 400 "Comment-to-DM automations are only supported on Instagram and Facebook"
 */
import { useState, useEffect, useCallback } from 'react';
import { api, PROFILE_ID } from '../api.js';
import { useApp } from '../App.jsx';
import { getTemplates, previewTemplate, seedIfEmpty } from '../lib/templates.js';

const IG_FB = ['instagram', 'facebook'];
const PLT_BG = { instagram: '#e1306c', facebook: '#1877f2' };
const PLT_ICON = { instagram: '📸', facebook: 'f' };

const ST = {
  published: { cls: 'badge-green',  label: 'Published' },
  scheduled: { cls: 'badge-blue',   label: 'Scheduled'  },
  draft:     { cls: 'badge-neutral', label: 'Draft'     },
};

const EMPTY = { name: '', keywords: '', dmMessage: '', commentReply: '', platformPostId: '', accountId: '' };

function tplBody(id, sub) {
  const t = getTemplates().find(x => x.id === id);
  if (!t) return '';
  return t.type === 'both' ? (sub === 'reply' ? t.replyBody || '' : t.dmBody || '') : (t.body || '');
}

export default function CommentRules({ onNavigate }) {
  const { accounts, showToast } = useApp();

  // IG/FB accounts only
  const eligibleAccounts = accounts.filter(a => IG_FB.includes(a.platform));
  const hasEligible = eligibleAccounts.length > 0;

  const [posts, setPosts]               = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch]             = useState('');
  const [selectedPost, setSelectedPost] = useState(null);

  const [automations, setAutomations]   = useState([]);
  const [autoLoading, setAutoLoading]   = useState(false);
  const [logs, setLogs]                 = useState({});
  const [logsOpen, setLogsOpen]         = useState(null);

  const [form, setForm]                 = useState(EMPTY);
  const [formOpen, setFormOpen]         = useState(false);
  const [editingId, setEditingId]       = useState(null);
  const [submitting, setSubmitting]     = useState(false);
  const [deleting, setDeleting]         = useState(null);

  const [connectUrls, setConnectUrls]   = useState({});
  const [templates, setTemplates]       = useState([]);
  const [dmTplId, setDmTplId]           = useState('');
  const [replyTplId, setReplyTplId]     = useState('');

  useEffect(() => { seedIfEmpty(); setTemplates(getTemplates()); }, []);

  // Prefetch connect URLs for IG + FB
  useEffect(() => {
    if (!PROFILE_ID) return;
    Promise.all(
      ['instagram', 'facebook'].map(p =>
        api.getConnectUrl(p, PROFILE_ID)
          .then(d => ({ p, url: d.authUrl || d.url }))
          .catch(() => null)
      )
    ).then(results => {
      const map = {};
      results.forEach(r => r && (map[r.p] = r.url));
      setConnectUrls(map);
    });
  }, []);

  // Load all posts (published + scheduled)
  const loadPosts = useCallback(async () => {
    if (!PROFILE_ID) { setPostsLoading(false); return; }
    setPostsLoading(true);
    try {
      const [sch, pub] = await Promise.allSettled([
        api.getPosts(PROFILE_ID, 'scheduled'),
        api.getPosts(PROFILE_ID, 'published'),
      ]);
      const all = [...(sch.value?.posts || []), ...(pub.value?.posts || [])];
      const seen = new Set();
      const unique = all.filter(p => {
        const k = p._id || p.id;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      unique.sort((a, b) => ({ published: 0, scheduled: 1, draft: 2 }[a.status] - ({ published: 0, scheduled: 1, draft: 2 }[b.status] ?? 3)));
      setPosts(unique);
    } catch (e) {
      showToast(e.message, false);
    } finally {
      setPostsLoading(false);
    }
  }, []);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  // Load all automations for profile (then filter per post)
  const loadAutomations = useCallback(async (post) => {
    setAutoLoading(true);
    setAutomations([]);
    try {
      const data = await api.getCommentAutomations(PROFILE_ID);
      const all  = data.automations || data.data || [];
      const postId = post._id || post.id;
      // Filter by post._id match OR platformPostId match
      setAutomations(all.filter(a =>
        a.postId === postId || a._id === postId ||
        a.platformPostId === (post.platformPostId || postId)
      ));
    } catch (e) {
      showToast(e.message, false);
    } finally {
      setAutoLoading(false);
    }
  }, []);

  const selectPost = (p) => {
    setSelectedPost(p);
    setFormOpen(false);
    setEditingId(null);
    setForm(EMPTY);
    setDmTplId('');
    setReplyTplId('');
    loadAutomations(p);
  };

  // Template helpers
  const dmTemplates    = templates.filter(t => t.type === 'send_dm' || t.type === 'both');
  const replyTemplates = templates.filter(t => t.type === 'reply_comment' || t.type === 'both');

  const applyDmTpl = (id) => {
    setDmTplId(id);
    const body = tplBody(id, 'dm');
    if (body) setForm(f => ({ ...f, dmMessage: previewTemplate(body) }));
  };
  const applyReplyTpl = (id) => {
    setReplyTplId(id);
    const body = tplBody(id, 'reply');
    if (body) setForm(f => ({ ...f, commentReply: previewTemplate(body) }));
  };

  const openNew = () => {
    const firstEligible = eligibleAccounts[0];
    setForm({
      ...EMPTY,
      accountId: firstEligible?._id || '',
      name: selectedPost ? `Comment Rule — ${(selectedPost.content || '').slice(0, 40)}` : '',
    });
    setDmTplId(''); setReplyTplId('');
    setEditingId(null);
    setFormOpen(true);
  };

  const openEdit = (auto) => {
    setForm({
      name:          auto.name || '',
      keywords:      Array.isArray(auto.keywords) ? auto.keywords.join(', ') : (auto.keywords || ''),
      dmMessage:     auto.dmMessage || '',
      commentReply:  auto.commentReply || '',
      platformPostId: auto.platformPostId || '',
      accountId:     auto.accountId || eligibleAccounts[0]?._id || '',
    });
    setDmTplId(''); setReplyTplId('');
    setEditingId(auto._id || auto.id);
    setFormOpen(true);
  };

  const resetForm = () => { setFormOpen(false); setEditingId(null); setForm(EMPTY); setDmTplId(''); setReplyTplId(''); };

  const submit = async () => {
    if (!form.name.trim())       { showToast('Enter a name', false); return; }
    if (!form.accountId)         { showToast('Select an Instagram or Facebook account', false); return; }
    if (!form.platformPostId.trim()) { showToast('Enter the platform post ID / URL', false); return; }
    if (!form.dmMessage.trim())  { showToast('DM message is required', false); return; }

    const acct = eligibleAccounts.find(a => a._id === form.accountId);
    const body = {
      name:          form.name.trim(),
      profileId:     PROFILE_ID,
      accountId:     form.accountId,
      platformPostId: form.platformPostId.trim(),
      dmMessage:     form.dmMessage.trim(),
    };
    if (form.keywords.trim())      body.keywords     = form.keywords.trim();
    if (form.commentReply.trim())  body.commentReply = form.commentReply.trim();

    setSubmitting(true);
    try {
      if (editingId) {
        await api.updateCommentAutomation(editingId, body);
        showToast('Automation updated ✓');
      } else {
        await api.createCommentAutomation(body);
        showToast('Automation created ✓ — live on Zernio!');
      }
      resetForm();
      if (selectedPost) loadAutomations(selectedPost);
      else {
        const all = await api.getCommentAutomations(PROFILE_ID);
        setAutomations(all.automations || []);
      }
    } catch (e) {
      showToast(e.message, false);
    } finally {
      setSubmitting(false);
    }
  };

  const deleteAuto = async (id) => {
    if (!confirm('Delete this automation? All logs will be deleted.')) return;
    setDeleting(id);
    try {
      await api.deleteCommentAutomation(id);
      showToast('Automation deleted');
      if (selectedPost) loadAutomations(selectedPost);
    } catch (e) {
      showToast(e.message, false);
    } finally {
      setDeleting(null);
    }
  };

  const toggleActive = async (auto) => {
    try {
      await api.updateCommentAutomation(auto._id || auto.id, { isActive: !auto.isActive });
      showToast(auto.isActive ? 'Paused' : 'Activated ✓');
      if (selectedPost) loadAutomations(selectedPost);
    } catch (e) {
      showToast(e.message, false);
    }
  };

  const loadLogs = async (id) => {
    if (logsOpen === id) { setLogsOpen(null); return; }
    setLogsOpen(id);
    if (logs[id]) return;
    try {
      const d = await api.getCommentAutomationLogs(id);
      setLogs(l => ({ ...l, [id]: d.logs || d.data || [] }));
    } catch (e) {
      showToast(e.message, false);
    }
  };

  // All automations across all posts (for overview when no post selected)
  const [allAutos, setAllAutos] = useState([]);
  useEffect(() => {
    if (!PROFILE_ID) return;
    api.getCommentAutomations(PROFILE_ID)
      .then(d => setAllAutos(d.automations || []))
      .catch(() => {});
  }, []);

  const visiblePosts = posts.filter(p => {
    const sOk = statusFilter === 'all' || p.status === statusFilter;
    const qOk = !search || (p.content || '').toLowerCase().includes(search.toLowerCase());
    return sOk && qOk;
  });

  // ── Connect required warning ─────────────────────────────────────────────
  if (!hasEligible) {
    return (
      <div>
        <div style={{ background: '#1a0a0a', border: '1px solid #7f1d1d', borderRadius: 10, padding: '20px 24px', marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fca5a5', marginBottom: 8 }}>
            ⚠️ Instagram or Facebook required
          </div>
          <div style={{ fontSize: 13, color: 'var(--dim)', marginBottom: 14, lineHeight: 1.6 }}>
            Comment-to-DM automations only work on <strong>Instagram</strong> and <strong>Facebook</strong>.<br />
            Your current profile has Twitter + LinkedIn — connect Instagram or Facebook first.
          </div>
          <div className="row" style={{ gap: 10 }}>
            {connectUrls.instagram && (
              <a href={connectUrls.instagram} target="_blank" rel="noreferrer" className="btn btn-primary">
                📸 Connect Instagram
              </a>
            )}
            {connectUrls.facebook && (
              <a href={connectUrls.facebook} target="_blank" rel="noreferrer" className="btn btn-secondary">
                f Connect Facebook
              </a>
            )}
            {!connectUrls.instagram && !connectUrls.facebook && (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Loading connect URLs…</span>
            )}
          </div>
        </div>

        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
          Once connected, you can set up automations like:
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 560 }}>
          {[
            { kw: 'FREE',  desc: 'Auto-DM the Winning Ads Playbook to anyone who comments "FREE"' },
            { kw: 'GUIDE', desc: 'Auto-DM the SEO Mastersheet to anyone who comments "GUIDE"' },
            { kw: 'HOOKS', desc: 'Auto-DM the 500+ Hooks library to anyone who comments "HOOKS"' },
            { kw: '—',     desc: 'Trigger on ALL comments — DM everyone who engages' },
          ].map((ex, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
              <span className="rule-keyword" style={{ flexShrink: 0 }}>{ex.kw}</span>
              <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{ex.desc}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── All automations overview ─────────────────────────────────── */}
      {allAutos.length > 0 && !selectedPost && (
        <div className="card">
          <div className="section-title mb12">Active Automations ({allAutos.length})</div>
          {allAutos.map(a => (
            <div key={a._id || a.id} className={`rule-card ${a.isActive ? 'active' : 'paused'}`} style={{ marginBottom: 8 }}>
              <div className="rule-header">
                <span className="rule-keyword">{a.keywords || 'ALL COMMENTS'}</span>
                <span style={{ fontSize: 12, color: 'var(--dim)' }}>📸/f {a.platform || ''}</span>
                <span className={`badge ${a.isActive ? 'badge-green' : 'badge-neutral'}`} style={{ marginLeft: 'auto' }}>
                  {a.isActive ? 'Active' : 'Paused'}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 8px' }}>{a.name}</div>
              <div className="rule-footer">
                <button className="btn btn-ghost btn-xs" onClick={() => loadLogs(a._id || a.id)}>
                  {logsOpen === (a._id || a.id) ? 'Hide Logs' : 'Logs'}
                </button>
                <div className="toggle-wrap" onClick={() => toggleActive(a)}>
                  <div className={`toggle ${a.isActive ? 'on' : ''}`} />
                  <span className="toggle-label" style={{ fontSize: 11 }}>{a.isActive ? 'On' : 'Off'}</span>
                </div>
                <button className="btn btn-ghost btn-xs" onClick={() => { setSelectedPost(null); openEdit(a); }}>Edit</button>
                <button className="btn btn-danger btn-xs" style={{ marginLeft: 'auto' }} onClick={() => deleteAuto(a._id || a.id)} disabled={deleting === (a._id || a.id)}>
                  {deleting === (a._id || a.id) ? '…' : 'Delete'}
                </button>
              </div>
              {logsOpen === (a._id || a.id) && (
                <div style={{ marginTop: 10 }}>
                  {(logs[a._id || a.id] || []).length === 0
                    ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>No triggers yet.</div>
                    : (logs[a._id || a.id] || []).slice(0, 10).map((l, i) => (
                      <div key={i} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 4, marginBottom: 3, background: '#09090b', display: 'flex', gap: 8 }}>
                        <span style={{ color: l.status === 'sent' ? 'var(--greenl)' : 'var(--redl)' }}>●</span>
                        <span style={{ color: 'var(--dim)' }}>@{l.username || l.commenterUsername || '?'}</span>
                        <span style={{ color: 'var(--muted)' }}>"{l.comment?.slice(0, 40) || '?'}"</span>
                        <span style={{ color: 'var(--muted)', marginLeft: 'auto' }}>{l.createdAt ? new Date(l.createdAt).toLocaleTimeString() : ''}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="cr-layout" style={{ flex: 1 }}>

        {/* ── LEFT: Post list ──────────────────────────────────────────── */}
        <div className="cr-posts">
          <div className="cr-posts-header">
            <div className="row mb8" style={{ justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Posts</span>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={loadPosts}>↻</button>
            </div>
            <div className="row mb8" style={{ gap: 5 }}>
              {[['all','All'], ['published','Pub'], ['scheduled','Sched']].map(([v,l]) => (
                <button key={v} className={`filter-btn ${statusFilter === v ? 'active' : ''}`} style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => setStatusFilter(v)}>{l}</button>
              ))}
            </div>
            <input className="input" style={{ fontSize: 12, padding: '7px 10px' }} placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="cr-posts-list">
            {postsLoading && <div className="loading-row" style={{ padding: 14 }}><span className="spinner" />Loading…</div>}
            {!postsLoading && !visiblePosts.length && (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                No posts yet. Compose one first.
              </div>
            )}
            {visiblePosts.map(p => {
              const id = p._id || p.id;
              const st = ST[p.status] || ST.draft;
              const active = selectedPost && (selectedPost._id || selectedPost.id) === id;
              return (
                <div key={id} className={`cr-post-item ${active ? 'selected' : ''}`} onClick={() => selectPost(p)}>
                  <div className="row mb4" style={{ gap: 5 }}>
                    {(p.platforms || []).slice(0, 3).map((pl, i) => (
                      <span key={i} style={{ fontSize: 10, fontWeight: 700, background: PLT_BG[pl.platform] || '#3f3f46', color: '#fff', padding: '1px 5px', borderRadius: 4 }}>
                        {PLT_ICON[pl.platform] || pl.platform}
                      </span>
                    ))}
                    <span className={`badge ${st.cls}`} style={{ fontSize: 9, padding: '1px 6px', marginLeft: 'auto' }}>{st.label}</span>
                  </div>
                  <div className="cr-post-preview">{p.content || id}</div>
                  {p.scheduledFor && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>{new Date(p.scheduledFor).toLocaleDateString()}</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT: Automations + form ────────────────────────────────── */}
        <div className="cr-rules">
          <div className="cr-rules-header">
            <div style={{ flex: 1, minWidth: 0 }}>
              {selectedPost ? (
                <>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>Comment Automations</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {(selectedPost.content || '').slice(0, 80)}
                  </div>
                </>
              ) : (
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>← Select a post, or use "+ New" for any post</span>
              )}
            </div>
            <button className="btn btn-primary btn-sm" onClick={openNew}>+ New Automation</button>
          </div>

          <div className="cr-rules-body">

            {/* ── Inline form ──────────────────────────────────────────── */}
            {formOpen && (
              <div className="rule-form mb16">
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14 }}>
                  {editingId ? 'Edit Automation' : '+ New Comment-to-DM Automation'}
                </div>

                <div className="field">
                  <label>Name</label>
                  <input className="input" placeholder="e.g. FREE keyword — Ads Playbook"
                    value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>📸 Account (IG / FB only)</label>
                    <select className="select" value={form.accountId} onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))}>
                      <option value="">— select —</option>
                      {eligibleAccounts.map(a => (
                        <option key={a._id} value={a._id}>{a.platform} @{a.username || a.displayName}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Trigger Keywords <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(leave blank = ALL)</span></label>
                    <input className="input" placeholder="FREE, GUIDE, LINK — comma-separated"
                      value={form.keywords} onChange={e => setForm(f => ({ ...f, keywords: e.target.value }))} />
                  </div>
                </div>

                <div className="field mt12">
                  <label>Platform Post ID <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(IG/FB native post ID or URL)</span></label>
                  <input className="input" placeholder="e.g. 17846368219941196 or paste the post URL"
                    value={form.platformPostId} onChange={e => setForm(f => ({ ...f, platformPostId: e.target.value }))} />
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                    Find this in your IG/FB post URL or Zernio dashboard → Posts → copy the platform post ID
                  </div>
                </div>

                {/* DM template selector */}
                <div className="field">
                  <label>📩 DM Message <span style={{ color: 'var(--redl)', fontWeight: 400 }}>*required</span></label>
                  {dmTemplates.length > 0 && (
                    <div className="row mb8" style={{ gap: 6 }}>
                      <select className="select" style={{ flex: 1 }} value={dmTplId}
                        onChange={e => applyDmTpl(e.target.value)}>
                        <option value="">— load from template —</option>
                        {dmTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                  )}
                  <textarea className="textarea" style={{ minHeight: 90 }}
                    placeholder="Hey {{firstName}}! Here's your free guide 👉 https://..."
                    value={form.dmMessage} onChange={e => setForm(f => ({ ...f, dmMessage: e.target.value }))} />
                  <div className="char-count">{form.dmMessage.length} chars</div>
                </div>

                {/* Comment reply (optional) */}
                <div className="field">
                  <label>💬 Comment Reply <span style={{ color: 'var(--muted)', fontWeight: 400 }}>optional — public reply to the comment</span></label>
                  {replyTemplates.length > 0 && (
                    <div className="row mb8" style={{ gap: 6 }}>
                      <select className="select" style={{ flex: 1 }} value={replyTplId}
                        onChange={e => applyReplyTpl(e.target.value)}>
                        <option value="">— load from template —</option>
                        {replyTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                  )}
                  <input className="input" placeholder="Check your DMs! 📩"
                    value={form.commentReply} onChange={e => setForm(f => ({ ...f, commentReply: e.target.value }))} />
                </div>

                <div className="row-end">
                  <button className="btn btn-ghost btn-sm" onClick={resetForm}>Cancel</button>
                  <button className="btn btn-primary btn-sm" onClick={submit} disabled={submitting}>
                    {submitting ? <><span className="spinner" style={{ marginRight: 7 }} />Saving…</> : (editingId ? 'Update' : '🚀 Create Automation')}
                  </button>
                </div>
              </div>
            )}

            {/* ── Automations for selected post ────────────────────────── */}
            {selectedPost && autoLoading && <div className="loading-row"><span className="spinner" />Loading…</div>}
            {selectedPost && !autoLoading && !automations.length && !formOpen && (
              <div className="empty" style={{ marginTop: 24 }}>
                <div className="empty-icon" style={{ fontSize: 26 }}>💬</div>
                <div className="empty-msg">No automations for this post yet.</div>
                <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={openNew}>+ Add First Automation</button>
              </div>
            )}

            {automations.map(a => (
              <div key={a._id || a.id} className={`rule-card ${a.isActive ? 'active' : 'paused'}`}>
                <div className="rule-header">
                  <span className="rule-keyword">{a.keywords || 'ALL COMMENTS'}</span>
                  <span className={`badge ${a.isActive ? 'badge-green' : 'badge-neutral'}`} style={{ marginLeft: 'auto' }}>
                    {a.isActive ? 'Active' : 'Paused'}
                  </span>
                </div>
                <div className="rule-actions-row">
                  {a.commentReply && (
                    <div className="rule-action-line">
                      <span className="rule-action-icon">💬</span>
                      <div style={{ fontSize: 12, color: 'var(--dim)' }}>{a.commentReply}</div>
                    </div>
                  )}
                  <div className="rule-action-line">
                    <span className="rule-action-icon">📩</span>
                    <div style={{ fontSize: 12, color: 'var(--dim)' }}>{a.dmMessage}</div>
                  </div>
                </div>
                {(a.totalTriggers !== undefined || a.successCount !== undefined) && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                    {a.totalTriggers ?? 0} triggers · {a.successCount ?? 0} DMs sent
                  </div>
                )}
                <div className="rule-footer">
                  <button className="btn btn-ghost btn-xs" onClick={() => loadLogs(a._id || a.id)}>
                    {logsOpen === (a._id || a.id) ? 'Hide Logs' : 'Logs'}
                  </button>
                  <div className="toggle-wrap" onClick={() => toggleActive(a)}>
                    <div className={`toggle ${a.isActive ? 'on' : ''}`} />
                    <span className="toggle-label" style={{ fontSize: 11 }}>{a.isActive ? 'On' : 'Off'}</span>
                  </div>
                  <button className="btn btn-ghost btn-xs" onClick={() => openEdit(a)}>Edit</button>
                  <button className="btn btn-danger btn-xs" style={{ marginLeft: 'auto' }}
                    onClick={() => deleteAuto(a._id || a.id)} disabled={deleting === (a._id || a.id)}>
                    {deleting === (a._id || a.id) ? '…' : 'Delete'}
                  </button>
                </div>
                {logsOpen === (a._id || a.id) && (
                  <div style={{ marginTop: 10 }}>
                    {(logs[a._id || a.id] || []).length === 0
                      ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>No triggers logged yet.</div>
                      : (logs[a._id || a.id] || []).slice(0, 20).map((l, i) => (
                        <div key={i} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 4, marginBottom: 3, background: '#09090b', display: 'flex', gap: 8 }}>
                          <span style={{ color: l.status === 'sent' ? 'var(--greenl)' : 'var(--redl)' }}>●</span>
                          <span style={{ color: 'var(--dim)' }}>@{l.username || l.commenterUsername || '?'}</span>
                          <span style={{ color: 'var(--muted)' }}>"{(l.comment || '').slice(0, 50)}"</span>
                          <span style={{ color: 'var(--muted)', marginLeft: 'auto' }}>{l.createdAt ? new Date(l.createdAt).toLocaleString() : ''}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
