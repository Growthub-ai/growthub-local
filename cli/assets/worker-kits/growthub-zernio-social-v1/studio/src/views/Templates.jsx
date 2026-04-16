import { useState, useEffect } from 'react';
import {
  getTemplates, saveTemplate, deleteTemplate,
  exportTemplates, importTemplates, previewTemplate,
  TEMPLATE_TYPES, VARIABLES, seedIfEmpty, forceSeed,
} from '../lib/templates.js';
import { useApp } from '../App.jsx';

const BADGE_CLASS = { blue: 'badge-blue', purple: 'badge-purple', green: 'badge-green' };

const EMPTY_FORM = { name: '', type: 'both', body: '', replyBody: '', dmBody: '' };

export default function Templates({ onNavigate }) {
  const { showToast } = useApp();
  const [templates, setTemplates] = useState([]);
  const [filter, setFilter]       = useState('all');
  const [editing, setEditing]     = useState(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [previewing, setPreviewing] = useState(null);

  useEffect(() => {
    seedIfEmpty();
    setTemplates(getTemplates());
  }, []);

  const refresh = () => setTemplates(getTemplates());

  const openNew  = () => { setForm(EMPTY_FORM); setEditing('new'); setPreviewing(null); };
  const openEdit = (t) => {
    setForm({ name: t.name, type: t.type, body: t.body || '', replyBody: t.replyBody || '', dmBody: t.dmBody || '', id: t.id });
    setEditing(t.id);
    setPreviewing(null);
  };
  const cancel = () => { setEditing(null); setForm(EMPTY_FORM); };

  const save = () => {
    if (!form.name.trim()) { showToast('Template name required', false); return; }
    if (form.type === 'both' && (!form.replyBody.trim() || !form.dmBody.trim())) {
      showToast('Both reply and DM body required for "Reply + DM" type', false); return;
    }
    if (form.type !== 'both' && !form.body.trim()) {
      showToast('Message body required', false); return;
    }
    saveTemplate({ ...form });
    refresh();
    cancel();
    showToast('Template saved ✓');
  };

  const del = (id) => {
    if (!confirm('Delete this template? Any rules using it will need to be updated.')) return;
    deleteTemplate(id);
    refresh();
    showToast('Template deleted');
  };

  const insertVar = (token, field) => {
    setForm(f => ({ ...f, [field]: (f[field] || '') + token }));
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        importTemplates(ev.target.result);
        refresh();
        showToast('Templates imported ✓');
      } catch (err) {
        showToast(err.message, false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const visible = filter === 'all' ? templates : templates.filter(t => t.type === filter);

  return (
    <div>
      <div className="row mb16" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Template Library</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Saved messages for auto-reply comments and DM lead magnets</div>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
            Import
            <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
          </label>
          <button
            className="btn btn-ghost btn-sm"
            title="Reset to all 9 Growthub lead magnet templates"
            onClick={() => { if (confirm('Load all 9 Growthub lead magnet templates? This will overwrite current templates.')) { forceSeed(); refresh(); showToast('Growthub templates loaded ✓'); } }}
          >
            ⚡ Load Growthub Templates
          </button>
          <button className="btn btn-ghost btn-sm" onClick={exportTemplates} disabled={!templates.length}>Export</button>
          <button className="btn btn-primary btn-sm" onClick={openNew}>+ New Template</button>
        </div>
      </div>

      <div className="filter-bar">
        {[['all','All'], ['both','Reply + DM'], ['reply_comment','Reply Only'], ['send_dm','DM Only']].map(([v, l]) => (
          <button key={v} className={`filter-btn ${filter === v ? 'active' : ''}`} onClick={() => setFilter(v)}>{l}</button>
        ))}
      </div>

      {editing && (
        <div className="rule-form mb24">
          <div style={{ fontWeight: 600, marginBottom: 16 }}>
            {editing === 'new' ? '+ New Template' : 'Edit Template'}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 12, marginBottom: 12 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Template Name</label>
              <input className="input" placeholder="e.g. Lead Magnet — Free Guide" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Type</label>
              <select className="select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="both">Reply + DM</option>
                <option value="reply_comment">Reply Only</option>
                <option value="send_dm">DM Only</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Insert variable</div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {VARIABLES.map(v => (
                <span
                  key={v.token}
                  className="tpl-var"
                  title={v.desc}
                  onClick={() => insertVar(v.token, form.type === 'both' ? 'dmBody' : 'body')}
                >
                  {v.token}
                </span>
              ))}
            </div>
          </div>

          {form.type === 'both' ? (
            <div className="both-fields">
              <div className="field" style={{ marginBottom: 0 }}>
                <label>💬 Public Reply (comment)</label>
                <textarea
                  className="textarea"
                  style={{ minHeight: 90 }}
                  placeholder="e.g. Check your DMs, {{firstName}}! 📩"
                  value={form.replyBody}
                  onChange={e => setForm(f => ({ ...f, replyBody: e.target.value }))}
                />
                <div className="char-count">{form.replyBody.length} chars</div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>📩 DM Body (private)</label>
                <textarea
                  className="textarea"
                  style={{ minHeight: 90 }}
                  placeholder="Hey {{firstName}}! Here's your free guide..."
                  value={form.dmBody}
                  onChange={e => setForm(f => ({ ...f, dmBody: e.target.value }))}
                />
                <div className="char-count">{form.dmBody.length} chars</div>
              </div>
            </div>
          ) : (
            <div className="field" style={{ marginBottom: 0 }}>
              <label>{form.type === 'send_dm' ? '📩 DM Body' : '💬 Reply Body'}</label>
              <textarea
                className="textarea"
                style={{ minHeight: 120 }}
                placeholder={form.type === 'send_dm' ? 'Hey {{firstName}}! Here\'s your free guide...' : 'Thanks for your interest! Check your DMs 📩'}
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              />
              <div className="char-count">{form.body.length} chars</div>
            </div>
          )}

          {(form.body || form.dmBody || form.replyBody) && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Preview (sample values)</div>
              <div className="preview-box">
                {form.type === 'both'
                  ? `💬 ${previewTemplate(form.replyBody)}\n\n📩 ${previewTemplate(form.dmBody)}`
                  : previewTemplate(form.body)}
              </div>
            </div>
          )}

          <div className="row-end mt12">
            <button className="btn btn-ghost btn-sm" onClick={cancel}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={save}>Save Template</button>
          </div>
        </div>
      )}

      {!visible.length && (
        <div className="empty">
          <div className="empty-icon">📝</div>
          <div className="empty-msg">
            {filter === 'all' ? 'No templates yet. Create your first reply or DM template.' : `No ${filter} templates.`}
          </div>
        </div>
      )}

      <div className="tpl-grid">
        {visible.map(t => {
          const meta = TEMPLATE_TYPES[t.type] || TEMPLATE_TYPES.both;
          const body = t.type === 'both'
            ? `💬 ${t.replyBody || ''}\n\n📩 ${t.dmBody || ''}`
            : (t.body || '');
          return (
            <div key={t.id} className={`tpl-card ${previewing === t.id ? 'selected' : ''}`}>
              <div className="tpl-type-row">
                <span className="tpl-type-icon">{meta.icon}</span>
                <span className="tpl-name">{t.name}</span>
                <span className={`badge badge-${BADGE_CLASS[meta.color]}`}>{meta.label}</span>
              </div>

              {t.keyword_hint && (
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  🔑 Trigger: <span style={{ color: 'var(--accentl)', fontFamily: 'monospace' }}>{t.keyword_hint}</span>
                </div>
              )}
              <div className="tpl-body">{body}</div>

              {previewing === t.id && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 5 }}>Preview</div>
                  <div className="preview-box" style={{ fontSize: 12, maxHeight: 'none' }}>{previewTemplate(body)}</div>
                </div>
              )}

              <div className="tpl-footer">
                <button className="btn btn-ghost btn-xs" onClick={() => setPreviewing(p => p === t.id ? null : t.id)}>
                  {previewing === t.id ? 'Hide' : 'Preview'}
                </button>
                <button className="btn btn-secondary btn-xs" onClick={() => openEdit(t)}>Edit</button>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => {
                    navigator.clipboard.writeText(body);
                    showToast('Copied ✓');
                  }}
                >Copy</button>
                <button className="btn btn-danger btn-xs" style={{ marginLeft: 'auto' }} onClick={() => del(t.id)}>✕</button>
              </div>

              {t.createdAt && (
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                  {new Date(t.createdAt).toLocaleDateString()}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {templates.length > 0 && !editing && (
        <div className="row mt12" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-primary btn-sm" onClick={() => onNavigate && onNavigate('commentrules')}>
            Use in Comment Rules →
          </button>
        </div>
      )}
    </div>
  );
}
