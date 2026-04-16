import { useState } from 'react';
import { api, PROFILE_ID } from '../api.js';
import { useApp } from '../App.jsx';

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

function fmt(n) {
  if (n === undefined || n === null) return '—';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function pct(n) {
  if (n === undefined || n === null) return '—';
  return (parseFloat(n) * (n <= 1 ? 100 : 1)).toFixed(2) + '%';
}

export default function Analytics() {
  const { showToast } = useApp();
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo]     = useState(today());
  const [postData, setPostData]       = useState(null);
  const [accountData, setAccountData] = useState(null);
  const [loading, setLoading]         = useState(false);

  const fetch = async () => {
    if (!PROFILE_ID) { showToast('PROFILE_ID not set', false); return; }
    setLoading(true);
    setPostData(null);
    setAccountData(null);
    try {
      const [posts, accounts] = await Promise.all([
        api.getPostAnalytics(PROFILE_ID, from, to),
        api.getAccountAnalytics(PROFILE_ID, from, to),
      ]);
      setPostData(posts);
      setAccountData(accounts);
    } catch (e) {
      showToast(e.message, false);
    } finally {
      setLoading(false);
    }
  };

  const posts    = postData?.posts    || postData?.data    || [];
  const accounts = accountData?.accounts || accountData?.data || [];

  return (
    <div>
      <div className="card mb24">
        <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="field flex1" style={{ marginBottom: 0 }}>
            <label>From</label>
            <input className="input" type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="field flex1" style={{ marginBottom: 0 }}>
            <label>To</label>
            <input className="input" type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <div style={{ alignSelf: 'flex-end' }}>
            <button className="btn btn-primary" onClick={fetch} disabled={loading}>
              {loading ? <><span className="spinner" style={{ marginRight: 7 }} />Fetching…</> : 'Fetch Analytics'}
            </button>
          </div>
          <div style={{ alignSelf: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setFrom(daysAgo(7)); setTo(today()); }}>Last 7d</button>
          </div>
          <div style={{ alignSelf: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setFrom(daysAgo(30)); setTo(today()); }}>Last 30d</button>
          </div>
        </div>
      </div>

      {!postData && !accountData && !loading && (
        <div className="empty">
          <div className="empty-icon">📊</div>
          <div className="empty-msg">Select a date range and click Fetch Analytics.</div>
        </div>
      )}

      {accountData && (
        <div className="mb24">
          <div className="section-title mb12">Account Summary</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Platform</th>
                  <th>Impressions</th>
                  <th>Reach</th>
                  <th>Engagement Rate</th>
                  <th>Follower Growth</th>
                  <th>Link Clicks</th>
                </tr>
              </thead>
              <tbody>
                {accounts.length ? accounts.map((a, i) => (
                  <tr key={i}>
                    <td style={{ textTransform: 'capitalize', fontWeight: 500 }}>{a.platform || a.accountId || '—'}</td>
                    <td>{fmt(a.impressions)}</td>
                    <td>{fmt(a.reach)}</td>
                    <td>{pct(a.engagementRate)}</td>
                    <td style={{ color: a.followerGrowth > 0 ? 'var(--greenl)' : 'inherit' }}>
                      {a.followerGrowth !== undefined ? (a.followerGrowth > 0 ? '+' : '') + fmt(a.followerGrowth) : '—'}
                    </td>
                    <td>{fmt(a.linkClicks)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>No account data for this period.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {postData && (
        <div>
          <div className="section-title mb12">Per-Post Performance</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Post</th>
                  <th>Platform</th>
                  <th>Scheduled</th>
                  <th>Impressions</th>
                  <th>Reach</th>
                  <th>Eng. Rate</th>
                  <th>Likes</th>
                  <th>Comments</th>
                  <th>Shares</th>
                </tr>
              </thead>
              <tbody>
                {posts.length ? posts.map((p, i) => (
                  <tr key={i}>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.content?.slice(0, 60) || p.postId || '—'}
                    </td>
                    <td style={{ textTransform: 'capitalize' }}>{p.platform || '—'}</td>
                    <td style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {p.scheduledFor ? new Date(p.scheduledFor).toLocaleDateString() : '—'}
                    </td>
                    <td>{fmt(p.impressions)}</td>
                    <td>{fmt(p.reach)}</td>
                    <td>{pct(p.engagementRate)}</td>
                    <td>{fmt(p.likes)}</td>
                    <td>{fmt(p.comments)}</td>
                    <td>{fmt(p.shares)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>No post data for this period.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
