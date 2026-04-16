import { useState, useEffect, useCallback } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';

export default function ApiKeys() {
  const { showToast } = useApp();
  const [keys, setKeys]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(null);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [scope, setScope]       = useState('read-write');
  const [permission, setPerm]   = useState('full');
  const [newKey, setNewKey]     = useState(null);

  const load = useCallback(() => {
    api.getApiKeys()
      .then(d => setKeys(d.keys || d.apiKeys || []))
      .catch(e => showToast(e.message, false))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const create = async () => {
    setCreating(true);
    try {
      const res = await api.createApiKey({ scope, permission });
      setNewKey(res.key || res.apiKey || res);
      showToast('API key created ✓');
      setShowForm(false);
      load();
    } catch (e) {
      showToast(e.message, false);
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id) => {
    if (!confirm('Revoke this API key? This cannot be undone.')) return;
    setRevoking(id);
    try {
      await api.deleteApiKey(id);
      showToast('Key revoked');
      load();
    } catch (e) {
      showToast(e.message, false);
    } finally {
      setRevoking(null);
    }
  };

  if (loading) return <div className="loading-row"><span className="spinner" />Loading API keys…</div>;

  return (
    <div>
      <div className="row mb16" style={{ justifyContent: 'space-between' }}>
        <div className="section-title" style={{ marginBottom: 0 }}>{keys.length} API Key{keys.length !== 1 ? 's' : ''}</div>
        <button className="btn btn-primary btn-sm" onClick={() => { setShowForm(f => !f); setNewKey(null); }}>
          {showForm ? '✕ Cancel' : '+ New Key'}
        </button>
      </div>

      {newKey && (
        <div className="banner banner-ok mb16">
          <div style={{ fontWeight: 600, marginBottom: 4 }}>New key created — copy it now, it will not be shown again</div>
          <div style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>{typeof newKey === 'string' ? newKey : JSON.stringify(newKey)}</div>
          <button className="btn btn-ghost btn-sm mt8" onClick={() => { navigator.clipboard.writeText(typeof newKey === 'string' ? newKey : JSON.stringify(newKey)); showToast('Copied'); }}>
            Copy
          </button>
        </div>
      )}

      {showForm && (
        <div className="card mb16">
          <div className="section-title mb16">Create API Key</div>
          <div className="field">
            <label>Scope</label>
            <select className="select" value={scope} onChange={e => setScope(e.target.value)}>
              <option value="read">read — list profiles, accounts, analytics, inbox</option>
              <option value="read-write">read-write — everything including create/schedule posts</option>
            </select>
          </div>
          <div className="field">
            <label>Permission</label>
            <select className="select" value={permission} onChange={e => setPerm(e.target.value)}>
              <option value="full">full — any profile on account</option>
              <option value="profiles-specific">profiles-specific — restricted to specific profile IDs</option>
            </select>
          </div>
          <div className="row-end">
            <button className="btn btn-primary" onClick={create} disabled={creating}>
              {creating ? <><span className="spinner" style={{ marginRight: 7 }} />Creating…</> : 'Create Key'}
            </button>
          </div>
        </div>
      )}

      {!keys.length && !showForm && (
        <div className="empty">
          <div className="empty-icon">🔑</div>
          <div className="empty-msg">No API keys found.</div>
        </div>
      )}

      {keys.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Key ID</th>
                <th>Scope</th>
                <th>Permission</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {keys.map(k => (
                <tr key={k._id || k.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{k._id || k.id}</td>
                  <td><span className={`badge ${k.scope === 'read-write' ? 'badge-purple' : 'badge-neutral'}`}>{k.scope}</span></td>
                  <td><span className="badge badge-neutral">{k.permission || k.permissions || '—'}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{k.createdAt ? new Date(k.createdAt).toLocaleDateString() : '—'}</td>
                  <td>
                    <button
                      className="btn btn-danger btn-xs"
                      onClick={() => revoke(k._id || k.id)}
                      disabled={revoking === (k._id || k.id)}
                    >
                      {revoking === (k._id || k.id) ? '…' : 'Revoke'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
