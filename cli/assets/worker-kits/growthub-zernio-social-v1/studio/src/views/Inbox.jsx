import { useState, useEffect, useCallback } from 'react';
import { api, PROFILE_ID } from '../api.js';
import { useApp } from '../App.jsx';

export default function Inbox() {
  const { showToast } = useApp();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [selected, setSelected]           = useState(null);
  const [thread, setThread]               = useState(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [reply, setReply]                 = useState('');
  const [sending, setSending]             = useState(false);

  const loadInbox = useCallback(() => {
    if (!PROFILE_ID) { setLoading(false); return; }
    api.getInbox(PROFILE_ID)
      .then(d => setConversations(d.conversations || d.inbox || []))
      .catch(e => showToast(e.message, false))
      .finally(() => setLoading(false));
  }, []);

  useEffect(loadInbox, [loadInbox]);

  const selectConv = async (conv) => {
    setSelected(conv);
    setThread(null);
    setReply('');
    setThreadLoading(true);
    try {
      const data = await api.getConversation(conv._id || conv.id);
      setThread(data);
    } catch (e) {
      showToast(e.message, false);
    } finally {
      setThreadLoading(false);
    }
  };

  const sendReply = async () => {
    if (!reply.trim()) return;
    if (!selected) return;
    setSending(true);
    try {
      await api.replyConversation(selected._id || selected.id, { content: reply });
      showToast('Reply sent ✓');
      setReply('');
      selectConv(selected);
    } catch (e) {
      showToast(e.message, false);
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="loading-row"><span className="spinner" />Loading inbox…</div>;

  if (!conversations.length) return (
    <div className="empty">
      <div className="empty-icon">💬</div>
      <div className="empty-msg">Inbox is empty. DMs, comments, and reviews will appear here.</div>
    </div>
  );

  const msgs = thread?.messages || thread?.replies || [];

  return (
    <div className="inbox-layout">
      <div className="inbox-list">
        {conversations.map(c => {
          const id = c._id || c.id;
          const isSelected = selected && (selected._id || selected.id) === id;
          return (
            <div
              key={id}
              className={`inbox-item ${isSelected ? 'selected' : ''}`}
              onClick={() => selectConv(c)}
            >
              <div className="inbox-platform">{c.platform} · {c.type || 'message'}</div>
              <div className="acc-name" style={{ marginBottom: 3 }}>{c.from || c.author || 'Unknown'}</div>
              <div className="inbox-preview">{c.preview || c.lastMessage || '…'}</div>
              {c.updatedAt && (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  {new Date(c.updatedAt).toLocaleDateString()}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="inbox-thread">
        {!selected && (
          <div className="empty" style={{ margin: 'auto' }}>
            <div className="empty-icon">💬</div>
            <div className="empty-msg">Select a conversation</div>
          </div>
        )}

        {selected && (
          <>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{selected.from || selected.author}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{selected.platform} · {selected._id || selected.id}</div>
            </div>

            <div className="thread-msgs">
              {threadLoading && <div className="loading-row"><span className="spinner" />Loading thread…</div>}
              {!threadLoading && !msgs.length && <div style={{ color: 'var(--muted)', fontSize: 13 }}>No messages in thread yet.</div>}
              {msgs.map((m, i) => {
                const isOut = m.direction === 'outbound' || m.isOwn;
                return (
                  <div key={i}>
                    <div className={`msg-meta ${isOut ? '' : ''}`} style={{ textAlign: isOut ? 'right' : 'left' }}>
                      {m.author || (isOut ? 'You' : selected.from)} · {m.createdAt ? new Date(m.createdAt).toLocaleTimeString() : ''}
                    </div>
                    <div className={`msg ${isOut ? 'msg-out' : 'msg-in'}`}>
                      {m.content || m.text || m.body}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="thread-reply">
              <textarea
                placeholder="Type a reply…"
                value={reply}
                onChange={e => setReply(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendReply(); }}
              />
              <div className="col" style={{ gap: 6, justifyContent: 'flex-end' }}>
                <button className="btn btn-primary btn-sm" onClick={sendReply} disabled={sending || !reply.trim()}>
                  {sending ? <span className="spinner" /> : 'Send'}
                </button>
                <span style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center' }}>⌘↵</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
