import { useState, useEffect, useCallback } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';

export default function Sequences({ onNavigate }) {
  const { showToast } = useApp();
  const [sequences, setSequences] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [toggling, setToggling]   = useState(null);
  const [expanded, setExpanded]   = useState(null);
  const [details, setDetails]     = useState({}); // id → full sequence with steps

  const load = useCallback(() => {
    api.getSequences()
      .then(d => setSequences(d.sequences || d.data || []))
      .catch(e => showToast(e.message, false))
      .finally(() => setLoading(false));
  }, []);

  const expand = async (id) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (details[id]) return;
    try {
      const d = await api.getSequence(id);
      const seq = d.sequence || d;
      setDetails(prev => ({ ...prev, [id]: seq }));
    } catch {}
  };

  useEffect(load, [load]);

  const toggle = async (seq) => {
    const id = seq._id || seq.id;
    const isActive = seq.status === 'active';
    setToggling(id);
    try {
      if (isActive) {
        await api.pauseSequence(id);
        showToast('Sequence paused');
      } else {
        await api.activateSequence(id);
        showToast('Sequence activated ✓');
      }
      load();
    } catch (e) {
      showToast(e.message, false);
    } finally {
      setToggling(null);
    }
  };

  if (loading) return <div className="loading-row"><span className="spinner" />Loading sequences…</div>;

  if (!sequences.length) return (
    <div>
      <div className="empty">
        <div className="empty-icon">🔀</div>
        <div className="empty-msg">No sequences found.<br />Sequences auto-enroll contacts into multi-step follow-up flows after they trigger a comment rule.</div>
      </div>

      <div className="card mt12" style={{ maxWidth: 600 }}>
        <div className="section-title mb12">How Sequences Work with Comment Rules</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { step: '1', icon: '💬', title: 'Comment trigger fires', desc: 'Someone comments "X" on your post' },
            { step: '2', icon: '📩', title: 'Instant reply + DM', desc: 'Comment Rule sends the lead magnet immediately' },
            { step: '3', icon: '🔀', title: 'Contact enrolled in sequence', desc: 'Commenter auto-enrolled into a follow-up nurture sequence' },
            { step: '4', icon: '📬', title: 'Automated follow-ups', desc: 'Day 1: "Did you get a chance to check it out?" · Day 3: Case study · Day 7: Offer' },
          ].map(s => (
            <div key={s.step} className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accentb)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--accentl)', flexShrink: 0 }}>
                {s.step}
              </div>
              <div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{s.icon} {s.title}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, fontSize: 12, color: 'var(--muted)' }}>
          Create sequences in the Zernio dashboard, then they appear here for activation management.
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div className="row mb16" style={{ justifyContent: 'space-between' }}>
        <div>
          <div className="section-title" style={{ marginBottom: 2 }}>{sequences.length} Sequence{sequences.length !== 1 ? 's' : ''}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Multi-step follow-up flows enrolled from comment automations</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={load}>↻ Refresh</button>
          <button className="btn btn-primary btn-sm" onClick={() => onNavigate?.('commentrules')}>+ New</button>
        </div>
      </div>

      {sequences.map(seq => {
        const id       = seq._id || seq.id;
        const isActive = seq.status === 'active';
        const detail   = details[id];
        const steps    = detail?.steps || seq.steps || seq.messages || [];
        const stepsCount = seq.stepsCount ?? steps.length;
        const isExpanded = expanded === id;

        return (
          <div key={id} className="seq-card">
            <div className="seq-header">
              <div className="row" style={{ gap: 10 }}>
                <span style={{ fontWeight: 600 }}>{seq.name || seq.title || id}</span>
                <span className={`badge ${isActive ? 'badge-green' : 'badge-neutral'}`}>{seq.status || 'unknown'}</span>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => expand(id)}>
                  {isExpanded ? 'Hide Steps' : `${stepsCount} Step${stepsCount !== 1 ? 's' : ''}`}
                </button>
                <div className="toggle-wrap" onClick={() => !toggling && toggle(seq)}>
                  <div className={`toggle ${isActive ? 'on' : ''}`} />
                  <span className="toggle-label">{toggling === id ? '…' : (isActive ? 'On' : 'Off')}</span>
                </div>
              </div>
            </div>

            <div className="seq-meta">
              <span>👥 {detail?.totalEnrolled ?? seq.totalEnrolled ?? 0} enrolled</span>
              <span>✅ {detail?.totalCompleted ?? seq.totalCompleted ?? 0} completed</span>
              <span>🚪 {detail?.totalExited ?? seq.totalExited ?? 0} exited</span>
              <span>📱 {seq.platform || 'linkedin'}</span>
              {seq.createdAt && <span>Created {new Date(seq.createdAt).toLocaleDateString()}</span>}
            </div>

            {seq.description && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>{seq.description}</div>
            )}

            {isExpanded && steps.length > 0 && (
              <div className="seq-steps">
                {steps.map((step, i) => {
                  const text = step.template?.components?.[0]?.text ||
                               step.content || step.message || step.body || '';
                  const delayMin = step.delayMinutes ?? (step.delay && step.delayUnit === 'minutes' ? step.delay : null);
                  const delayDay = step.delayDays ?? (step.delay && step.delayUnit === 'days' ? step.delay : null);
                  return (
                    <div key={i} className="seq-step">
                      <span className="seq-step-num">{step.order ?? i + 1}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, marginBottom: 2 }}>
                          📩 Message
                          {delayDay ? <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · Day {delayDay}</span> : null}
                          {!delayDay && delayMin === 0 ? <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · Instant</span> : null}
                        </div>
                        {text && (
                          <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
                            "{text.slice(0, 120)}{text.length > 120 ? '…' : ''}"
                          </div>
                        )}
                      </div>
                      <span className="badge badge-green" style={{ fontSize: 10 }}>active</span>
                    </div>
                  );
                })}
              </div>
            )}
            {isExpanded && !steps.length && !detail && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                <span className="spinner" style={{ marginRight: 6 }} />Loading steps…
              </div>
            )}

            {isExpanded && !steps.length && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>No steps defined for this sequence.</div>
            )}
          </div>
        );
      })}

      <div style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>
        Sequences use <span style={{ fontFamily: 'monospace', color: 'var(--accentl)' }}>POST /api/v1/sequences/:id/activate</span> and <span style={{ fontFamily: 'monospace', color: 'var(--accentl)' }}>/pause</span>. Link sequences to comment rules in <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => onNavigate?.('commentrules')}>Comment Rules →</span>
      </div>
    </div>
  );
}
