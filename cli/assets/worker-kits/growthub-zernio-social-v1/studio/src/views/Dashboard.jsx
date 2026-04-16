import { useEffect, useState } from 'react';
import { api, PROFILE_ID } from '../api.js';
import { useApp } from '../App.jsx';

const PLT_ICON = { twitter:'𝕏', linkedin:'in', instagram:'📸', facebook:'f', tiktok:'🎵', youtube:'▶', bluesky:'🦋', threads:'@', reddit:'r/', pinterest:'P', telegram:'✈', whatsapp:'W' };
const PLT_BG   = { twitter:'#000', linkedin:'#0077b5', instagram:'#e1306c', facebook:'#1877f2', tiktok:'#010101', youtube:'#ff0000', bluesky:'#0085ff', threads:'#101010', reddit:'#ff4500', pinterest:'#e60023', telegram:'#0088cc', whatsapp:'#25d366' };

export default function Dashboard({ onNavigate }) {
  const { accounts, profile, showToast } = useApp();
  const [scheduled, setScheduled] = useState(null);
  const [queues, setQueues]       = useState(null);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    if (!PROFILE_ID) { setLoading(false); return; }
    Promise.all([
      api.getPosts(PROFILE_ID, 'scheduled'),
      api.getQueues(PROFILE_ID),
    ])
      .then(([posts, qs]) => {
        setScheduled((posts.posts || []).length);
        setQueues((qs.queues || []).length);
      })
      .catch(e => showToast(e.message, false))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Profile</div>
          <div className="stat-value" style={{ fontSize: 18, paddingTop: 4 }}>{profile?.name || '—'}</div>
          <div className="stat-sub">{PROFILE_ID || 'not set'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Accounts</div>
          <div className="stat-value">{accounts.length}</div>
          <div className="stat-sub">connected platforms</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Scheduled</div>
          <div className="stat-value">{loading ? '…' : scheduled ?? '—'}</div>
          <div className="stat-sub">pending posts</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Queues</div>
          <div className="stat-value">{loading ? '…' : queues ?? '—'}</div>
          <div className="stat-sub">recurring slots</div>
        </div>
      </div>

      <div className="row mb16" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="section-title" style={{ marginBottom: 0 }}>Connected Platforms</div>
        <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('accounts')}>View all →</button>
      </div>

      {!accounts.length && !loading && (
        <div className="empty"><div className="empty-icon">🔗</div><div className="empty-msg">No accounts connected on this profile</div></div>
      )}

      {accounts.map(a => (
        <div key={a._id || a.accountId} className="account-card">
          <div className="platform-icon" style={{ background: PLT_BG[a.platform] || '#3f3f46', color: '#fff' }}>
            {PLT_ICON[a.platform] || a.platform?.[0]?.toUpperCase()}
          </div>
          <div className="acc-info">
            <div className="acc-name">{a.displayName || a.username}</div>
            <div className="acc-handle">{a.platform} · @{a.username}</div>
          </div>
          <span className="badge badge-green">Active</span>
        </div>
      ))}

      <hr className="divider" />

      <div className="section-title mb8">Quick Actions</div>
      <div className="row">
        <button className="btn btn-primary" onClick={() => onNavigate('compose')}>✏️ New Post</button>
        <button className="btn btn-secondary" onClick={() => onNavigate('scheduled')}>📅 View Scheduled</button>
        <button className="btn btn-secondary" onClick={() => onNavigate('queues')}>🔄 Manage Queues</button>
        <button className="btn btn-secondary" onClick={() => onNavigate('inbox')}>💬 Inbox</button>
        <button className="btn btn-secondary" onClick={() => onNavigate('analytics')}>📊 Analytics</button>
      </div>
    </div>
  );
}
