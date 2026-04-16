import { useState, useEffect, useCallback } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';

export default function Sequences({ onNavigate }) {
  const { showToast } = useApp();
  const [sequences, setSequences] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [toggling, setToggling]   = useState(null);
  const [expanded, setExpanded]   = useState(null);

  const load = useCallback(() => {
    api.getSequences()
      .then(d => setSequences(d.sequences || d.data || []))
      .catch(e => showToast(e.message, false))
      .finally(() => setLoading(false));
  }, []);

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
        <button className="btn btn-ghost btn-sm" onClick={load}>↻ Refresh</button>
      </div>

      {sequences.map(seq => {
        const id       = seq._id || seq.id;
        const isActive = seq.status === 'active';
        const steps    = seq.steps || seq.messages || [];
        const isExpanded = expanded === id;

        return (
          <div key={id} className="seq-card">
            <div className="seq-header">
              <div className="row" style={{ gap: 10 }}>
                <span style={{ fontWeight: 600 }}>{seq.name || seq.title || id}</span>
                <span className={`badge ${isActive ? 'badge-green' : 'badge-neutral'}`}>{seq.status || 'unknown'}</span>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(e => e === id ? null : id)}>
                  {isExpanded ? 'Hide Steps' : `${steps.length} Steps`}
                </button>
                <div className="toggle-wrap" onClick={() => !toggling && toggle(seq)}>
                  <div className={`toggle ${isActive ? 'on' : ''}`} />
                  <span className="toggle-label">{toggling === id ? '…' : (isActive ? 'On' : 'Off')}</span>
                </div>
              </div>
            </div>

            <div className="seq-meta">
              {seq.enrolledCount !== undefined && <span>👥 {seq.enrolledCount} enrolled</span>}
              {seq.completedCount !== undefined && <span>✅ {seq.completedCount} completed</span>}
              {seq.trigger && <span>🎯 Trigger: <span style={{ fontFamily: 'monospace', color: 'var(--accentl)' }}>{seq.trigger}</span></span>}
              {seq.createdAt && <span>Created {new Date(seq.createdAt).toLocaleDateString()}</span>}
            </div>

            {seq.description && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>{seq.description}</div>
            )}

            {isExpanded && steps.length > 0 && (
              <div className="seq-steps">
                {steps.map((step, i) => (
                  <div key={i} className="seq-step">
                    <span className="seq-step-num">{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, marginBottom: 2 }}>
                        {step.type === 'send_dm' ? '📩' : step.type === 'reply_comment' ? '💬' : '📬'}{' '}
                        {step.name || step.type || 'Step'}
                        {step.delayDays ? <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · Day {step.delayDays}</span> : null}
                        {step.delayHours ? <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · +{step.delayHours}h</span> : null}
                      </div>
                      {step.content && (
                        <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
                          "{step.content.slice(0, 100)}{step.content.length > 100 ? '…' : ''}"
                        </div>
                      )}
                    </div>
                    <span className={`badge ${step.status === 'active' ? 'badge-green' : 'badge-neutral'}`} style={{ fontSize: 10 }}>
                      {step.status || 'active'}
                    </span>
                  </div>
                ))}
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
