import { useState, useEffect, useCallback } from 'react';
import { api, PROFILE_ID } from '../api.js';
import { useApp } from '../App.jsx';

const DAYS = ['mon','tue','wed','thu','fri','sat','sun'];
const ALL_PLATS = ['twitter','linkedin','instagram','facebook','tiktok','youtube','bluesky','threads','reddit','pinterest','telegram','whatsapp'];

const emptySlot = () => ({ day: 'mon', time: '09:00', platforms: [] });

export default function Queues() {
  const { accounts, showToast } = useApp();
  const [queues, setQueues]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const [name, setName]           = useState('');
  const [timezone, setTimezone]   = useState('America/New_York');
  const [slots, setSlots]         = useState([emptySlot()]);

  const availPlats = accounts.length
    ? [...new Set(accounts.map(a => a.platform))]
    : ALL_PLATS;

  const load = useCallback(() => {
    if (!PROFILE_ID) { setLoading(false); return; }
    api.getQueues(PROFILE_ID)
      .then(d => setQueues(d.queues || []))
      .catch(e => showToast(e.message, false))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const addSlot    = () => setSlots(s => [...s, emptySlot()]);
  const removeSlot = (i) => setSlots(s => s.filter((_, j) => j !== i));
  const updateSlot = (i, key, val) => setSlots(s => s.map((sl, j) => j !== i ? sl : { ...sl, [key]: val }));
  const toggleSlotPlat = (i, p) => {
    const sl = slots[i];
    const plats = sl.platforms.includes(p) ? sl.platforms.filter(x => x !== p) : [...sl.platforms, p];
    updateSlot(i, 'platforms', plats);
  };

  const create = async () => {
    if (!name.trim()) { showToast('Enter a queue name', false); return; }
    const validSlots = slots.filter(s => s.platforms.length);
    if (!validSlots.length) { showToast('Each slot needs at least one platform', false); return; }
    setCreating(true);
    try {
      await api.createQueue({ profileId: PROFILE_ID, name, timezone, slots: validSlots });
      showToast('Queue created ✓');
      setName(''); setSlots([emptySlot()]); setShowForm(false);
      load();
    } catch (e) {
      showToast(e.message, false);
    } finally {
      setCreating(false);
    }
  };

  const deleteQueue = async (id) => {
    if (!confirm('Delete this queue? Already-scheduled posts remain.')) return;
    setDeleting(id);
    try {
      await api.deleteQueue(id);
      showToast('Queue deleted');
      load();
    } catch (e) {
      showToast(e.message, false);
    } finally {
      setDeleting(null);
    }
  };

  if (loading) return <div className="loading-row"><span className="spinner" />Loading queues…</div>;

  return (
    <div>
      <div className="row mb16" style={{ justifyContent: 'space-between' }}>
        <div className="section-title" style={{ marginBottom: 0 }}>{queues.length} Queue{queues.length !== 1 ? 's' : ''}</div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(f => !f)}>
          {showForm ? '✕ Cancel' : '+ New Queue'}
        </button>
      </div>

      {showForm && (
        <div className="card mb16">
          <div className="section-title mb16">New Recurring Queue</div>
          <div className="field">
            <label>Queue Name</label>
            <input className="input" placeholder="e.g. weekly-evergreen" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>Timezone</label>
            <input className="input" value={timezone} onChange={e => setTimezone(e.target.value)} />
          </div>

          <div className="field">
            <label>Time Slots</label>
            {slots.map((sl, i) => (
              <div key={i} style={{ background: '#09090b', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                <div className="row mb8">
                  <select className="select" style={{ width: 90 }} value={sl.day} onChange={e => updateSlot(i, 'day', e.target.value)}>
                    {DAYS.map(d => <option key={d}>{d}</option>)}
                  </select>
                  <input className="input" type="time" style={{ width: 110 }} value={sl.time} onChange={e => updateSlot(i, 'time', e.target.value)} />
                  <button className="btn btn-danger btn-xs" style={{ marginLeft: 'auto' }} onClick={() => removeSlot(i)} disabled={slots.length === 1}>✕</button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 5 }}>Platforms</div>
                <div className="plat-row">
                  {availPlats.map(p => (
                    <span key={p} className={`plat-toggle ${sl.platforms.includes(p) ? 'selected' : ''}`} onClick={() => toggleSlotPlat(i, p)}>{p}</span>
                  ))}
                </div>
              </div>
            ))}
            <button className="btn btn-ghost btn-sm mt8" onClick={addSlot}>+ Add Slot</button>
          </div>

          <div className="row-end">
            <button className="btn btn-primary" onClick={create} disabled={creating}>
              {creating ? <><span className="spinner" style={{ marginRight: 7 }} />Creating…</> : 'Create Queue'}
            </button>
          </div>
        </div>
      )}

      {!queues.length && !showForm && (
        <div className="empty">
          <div className="empty-icon">🔄</div>
          <div className="empty-msg">No queues yet. Create one to auto-schedule posts into recurring time slots.</div>
        </div>
      )}

      {queues.map(q => (
        <div key={q._id} className="card mb16">
          <div className="row mb8" style={{ justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontWeight: 600 }}>{q.name}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 10 }}>{q.timezone}</span>
            </div>
            <button className="btn btn-danger btn-sm" onClick={() => deleteQueue(q._id)} disabled={deleting === q._id}>
              {deleting === q._id ? '…' : 'Delete'}
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Day</th><th>Time</th><th>Platforms</th></tr>
              </thead>
              <tbody>
                {(q.slots || []).map((sl, i) => (
                  <tr key={i}>
                    <td style={{ textTransform: 'capitalize' }}>{sl.day}</td>
                    <td>{sl.time}</td>
                    <td>{(sl.platforms || []).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
