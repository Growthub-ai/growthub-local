import { useState, useEffect, useCallback } from 'react';
import { api, PROFILE_ID } from '../api.js';
import { useApp } from '../App.jsx';

export default function Scheduled() {
  const { showToast } = useApp();
  const [posts, setPosts]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(() => {
    if (!PROFILE_ID) { setLoading(false); return; }
    setLoading(true);
    api.getPosts(PROFILE_ID, 'scheduled')
      .then(d => setPosts(d.posts || []))
      .catch(e => showToast(e.message, false))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const deletePost = async (id) => {
    if (!confirm('Unschedule this post?')) return;
    setDeleting(id);
    try {
      await api.deletePost(id);
      showToast('Post unscheduled');
      load();
    } catch (e) {
      showToast(e.message, false);
    } finally {
      setDeleting(null);
    }
  };

  if (loading) return <div className="loading-row"><span className="spinner" />Loading scheduled posts…</div>;

  if (!posts.length) return (
    <div className="empty">
      <div className="empty-icon">📅</div>
      <div className="empty-msg">No scheduled posts. Use Compose to schedule your first post.</div>
    </div>
  );

  return (
    <div>
      <div className="row mb16" style={{ justifyContent: 'space-between' }}>
        <div className="section-title" style={{ marginBottom: 0 }}>{posts.length} Scheduled Post{posts.length !== 1 ? 's' : ''}</div>
        <button className="btn btn-ghost btn-sm" onClick={load}>↻ Refresh</button>
      </div>

      {posts.map(p => (
        <div key={p._id || p.id} className="post-card">
          <div className="post-meta">
            {(p.platforms || []).map(pl => (
              <span key={pl.platform} className="badge badge-neutral" style={{ marginRight: 2 }}>{pl.platform}</span>
            ))}
            <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 4 }}>
              {p.scheduledFor ? new Date(p.scheduledFor).toLocaleString() : 'Queued'}
            </span>
            <span className="badge badge-blue" style={{ marginLeft: 'auto' }}>Scheduled</span>
          </div>
          <div className="post-content">{p.content}</div>
          {p.media?.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
              📎 {p.media.length} media file{p.media.length > 1 ? 's' : ''}
            </div>
          )}
          <div className="post-actions">
            <span style={{ fontSize: 11, color: 'var(--muted)', alignSelf: 'center', fontFamily: 'monospace' }}>
              {p._id || p.id}
            </span>
            <button
              className="btn btn-danger btn-xs"
              onClick={() => deletePost(p._id || p.id)}
              disabled={deleting === (p._id || p.id)}
            >
              {deleting === (p._id || p.id) ? '…' : 'Unschedule'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
