import { useState, useEffect, useCallback } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';

export default function Automations() {
  const { showToast } = useApp();
  const [automations, setAutomations] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [running, setRunning]         = useState(null);
  const [logs, setLogs]               = useState({});
  const [logsOpen, setLogsOpen]       = useState(null);
  const [logsLoading, setLogsLoading] = useState(false);

  const load = useCallback(() => {
    api.getAutomations()
      .then(d => setAutomations(d.automations || d.data || []))
      .catch(e => showToast(e.message, false))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const run = async (id) => {
    setRunning(id);
    try {
      await api.runAutomation(id);
      showToast('Automation triggered ✓');
      load();
    } catch (e) {
      showToast(e.message, false);
    } finally {
      setRunning(null);
    }
  };

  const fetchLogs = async (id) => {
    if (logsOpen === id) { setLogsOpen(null); return; }
    setLogsOpen(id);
    if (logs[id]) return;
    setLogsLoading(true);
    try {
      const data = await api.getAutomationLogs(id);
      setLogs(l => ({ ...l, [id]: data.logs || data.data || [] }));
    } catch (e) {
      showToast(e.message, false);
    } finally {
      setLogsLoading(false);
    }
  };

  if (loading) return <div className="loading-row"><span className="spinner" />Loading automations…</div>;

  if (!automations.length) return (
    <div className="empty">
      <div className="empty-icon">⚡</div>
      <div className="empty-msg">No automations found on this account.<br />Create automations in the Zernio dashboard.</div>
    </div>
  );

  return (
    <div>
      <div className="section-title mb16">{automations.length} Automation{automations.length !== 1 ? 's' : ''}</div>
      {automations.map(a => {
        const id = a._id || a.id;
        return (
          <div key={id} className="card mb16">
            <div className="row mb8" style={{ justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontWeight: 600 }}>{a.name || a.title || id}</span>
                <span className={`badge ${a.status === 'active' ? 'badge-green' : 'badge-neutral'} ml8`} style={{ marginLeft: 10 }}>
                  {a.status || 'unknown'}
                </span>
              </div>
              <div className="row">
                <button className="btn btn-ghost btn-sm" onClick={() => fetchLogs(id)}>
                  {logsOpen === id ? 'Hide Logs' : 'Logs'}
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => run(id)} disabled={running === id}>
                  {running === id ? <><span className="spinner" style={{ marginRight: 6 }} />Running…</> : '▶ Run'}
                </button>
              </div>
            </div>
            {a.description && <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{a.description}</div>}
            {a.trigger && <div style={{ fontSize: 12, color: 'var(--dim)' }}>Trigger: <span style={{ color: 'var(--accentl)', fontFamily: 'monospace' }}>{a.trigger}</span></div>}

            {logsOpen === id && (
              <div style={{ marginTop: 12 }}>
                <div className="section-title mb8">Execution Logs</div>
                {logsLoading ? (
                  <div className="loading-row"><span className="spinner" />Loading…</div>
                ) : logs[id]?.length ? (
                  <div style={{ maxHeight: 220, overflow: 'auto' }}>
                    <table style={{ fontSize: 12 }}>
                      <thead><tr><th>Time</th><th>Status</th><th>Message</th></tr></thead>
                      <tbody>
                        {logs[id].map((l, i) => (
                          <tr key={i}>
                            <td style={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                              {l.createdAt ? new Date(l.createdAt).toLocaleString() : '—'}
                            </td>
                            <td>
                              <span className={`badge ${l.status === 'success' ? 'badge-green' : l.status === 'error' ? 'badge-red' : 'badge-neutral'}`}>
                                {l.status}
                              </span>
                            </td>
                            <td style={{ color: 'var(--muted)' }}>{l.message || l.msg || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>No logs yet.</div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
