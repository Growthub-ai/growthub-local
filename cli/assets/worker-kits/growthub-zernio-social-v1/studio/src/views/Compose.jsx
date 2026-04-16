import { useState, useEffect } from 'react';
import { api, PROFILE_ID } from '../api.js';
import { useApp } from '../App.jsx';

const PLT_ICON = { twitter:'𝕏', linkedin:'in', instagram:'📸', facebook:'f', tiktok:'🎵', youtube:'▶', bluesky:'🦋', threads:'@', reddit:'r/', pinterest:'P', telegram:'✈', whatsapp:'W' };
const CHAR_LIMIT = { twitter: 280, bluesky: 300, threads: 500, pinterest: 500, linkedin: 3000, instagram: 2200, tiktok: 2200, facebook: 63206, youtube: 5000, telegram: 4096, whatsapp: 1024 };

export default function Compose({ onNavigate }) {
  const { accounts, showToast } = useApp();
  const [content, setContent]     = useState('');
  const [selected, setSelected]   = useState([]);
  const [mode, setMode]           = useState('time'); // 'time' | 'queue'
  const [schedTime, setSchedTime] = useState('');
  const [queues, setQueues]       = useState([]);
  const [queueId, setQueueId]     = useState('');
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaId, setMediaId]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner]       = useState(null);

  useEffect(() => {
    if (!PROFILE_ID) return;
    api.getQueues(PROFILE_ID)
      .then(d => setQueues(d.queues || []))
      .catch(() => {});
  }, []);

  const toggle = (a) => {
    setSelected(s => s.find(x => x._id === a._id) ? s.filter(x => x._id !== a._id) : [...s, a]);
  };

  const charLimit = () => {
    if (!selected.length) return null;
    const mins = selected.map(a => CHAR_LIMIT[a.platform] || 9999);
    return Math.min(...mins);
  };
  const limit = charLimit();
  const over  = limit && content.length > limit;

  const uploadIfNeeded = async () => {
    if (!mediaFile) return null;
    const res = await api.uploadMedia(mediaFile);
    return res.mediaId || res._id;
  };

  const submit = async () => {
    if (!content.trim()) { showToast('Add a caption first', false); return; }
    if (!selected.length) { showToast('Select at least one platform', false); return; }
    if (mode === 'time' && !schedTime) { showToast('Pick a schedule time or switch to Queue mode', false); return; }
    if (mode === 'queue' && !queueId) { showToast('Select a queue', false); return; }

    setSubmitting(true);
    setBanner(null);

    try {
      let uploadedMediaId = mediaId;
      if (mediaFile && !mediaId) {
        uploadedMediaId = await uploadIfNeeded();
        setMediaId(uploadedMediaId);
      }

      const platforms = selected.map(a => ({ platform: a.platform, accountId: a._id || a.accountId }));
      const ikey = `compose-${Date.now()}`;
      const body = { profileId: PROFILE_ID, content, platforms };

      if (mode === 'time') body.scheduledFor = new Date(schedTime).toISOString();
      else body.queueId = queueId;

      if (uploadedMediaId) body.media = [{ mediaId: uploadedMediaId }];

      const res = await api.createPost(body, ikey);
      setBanner({ ok: true, msg: `✓ Post scheduled! ID: ${res.id || res._id || 'created'}` });
      showToast('Post scheduled ✓');
      setContent('');
      setSelected([]);
      setSchedTime('');
      setMediaFile(null);
      setMediaId('');
    } catch (e) {
      setBanner({ ok: false, msg: `✗ ${e.message}` });
      showToast(e.message, false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 700 }}>
      {banner && (
        <div className={`banner ${banner.ok ? 'banner-ok' : 'banner-err'}`}>{banner.msg}</div>
      )}

      <div className="card mb16">
        <div className="field">
          <label>Caption</label>
          <textarea
            className="textarea"
            placeholder="Write your post…"
            value={content}
            onChange={e => setContent(e.target.value)}
          />
          {limit && (
            <div className={`char-count ${over ? 'char-over' : ''}`}>
              {content.length} / {limit}{over ? ' — over limit for selected platforms' : ''}
            </div>
          )}
        </div>
      </div>

      <div className="card mb16">
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Platforms</label>
          {!accounts.length ? (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>No accounts connected.</div>
          ) : (
            <div className="plat-row">
              {accounts.map(a => (
                <span
                  key={a._id}
                  className={`plat-toggle ${selected.find(x => x._id === a._id) ? 'selected' : ''}`}
                  onClick={() => toggle(a)}
                >
                  {PLT_ICON[a.platform] || a.platform} {a.displayName || a.username}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card mb16">
        <div className="field">
          <label>Scheduling Mode</label>
          <div className="row mb8">
            <button className={`btn btn-sm ${mode === 'time' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('time')}>Specific Time</button>
            <button className={`btn btn-sm ${mode === 'queue' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('queue')}>Add to Queue</button>
          </div>
        </div>

        {mode === 'time' ? (
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Schedule At</label>
            <input className="input" type="datetime-local" value={schedTime} onChange={e => setSchedTime(e.target.value)} />
          </div>
        ) : (
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Queue</label>
            {queues.length ? (
              <select className="select" value={queueId} onChange={e => setQueueId(e.target.value)}>
                <option value="">— select queue —</option>
                {queues.map(q => (
                  <option key={q._id} value={q._id}>{q.name}</option>
                ))}
              </select>
            ) : (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>No queues defined. <span style={{ color: 'var(--accentl)', cursor: 'pointer' }} onClick={() => onNavigate('queues')}>Create one →</span></div>
            )}
          </div>
        )}
      </div>

      <div className="card mb16">
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Media (optional)</label>
          <input
            className="input"
            type="file"
            accept="image/*,video/*"
            style={{ cursor: 'pointer', padding: '7px 12px' }}
            onChange={e => { setMediaFile(e.target.files[0] || null); setMediaId(''); }}
          />
          {mediaFile && <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 5 }}>{mediaFile.name} — will upload on submit</div>}
          {mediaId && <div style={{ fontSize: 12, color: 'var(--greenl)', marginTop: 5 }}>Uploaded: {mediaId}</div>}
        </div>
      </div>

      <div className="row-end">
        <button className="btn btn-secondary" onClick={() => { setContent(''); setSelected([]); setSchedTime(''); setMediaFile(null); setBanner(null); }}>Clear</button>
        <button className="btn btn-primary" onClick={submit} disabled={submitting || over}>
          {submitting ? <><span className="spinner" style={{ marginRight: 7 }} />Scheduling…</> : 'Schedule Post'}
        </button>
      </div>
    </div>
  );
}
