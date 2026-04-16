import { useApp } from '../App.jsx';

const PLT_ICON = { twitter:'𝕏', linkedin:'in', instagram:'📸', facebook:'f', tiktok:'🎵', youtube:'▶', bluesky:'🦋', threads:'@', reddit:'r/', pinterest:'P', telegram:'✈', whatsapp:'W' };
const PLT_BG   = { twitter:'#000', linkedin:'#0077b5', instagram:'#e1306c', facebook:'#1877f2', tiktok:'#010101', youtube:'#ff0000', bluesky:'#0085ff', threads:'#101010', reddit:'#ff4500', pinterest:'#e60023', telegram:'#0088cc', whatsapp:'#25d366' };

export default function Accounts() {
  const { accounts } = useApp();

  if (!accounts.length) {
    return (
      <div className="empty">
        <div className="empty-icon">🔗</div>
        <div className="empty-msg">No accounts connected on this profile.<br />Connect platforms via Zernio dashboard → Settings → Accounts.</div>
      </div>
    );
  }

  return (
    <div>
      <div className="section-title mb16">{accounts.length} Connected Account{accounts.length !== 1 ? 's' : ''}</div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Platform</th>
              <th>Handle</th>
              <th>Display Name</th>
              <th>Account ID</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map(a => (
              <tr key={a._id || a.accountId}>
                <td>
                  <div className="row">
                    <div
                      className="platform-icon"
                      style={{ background: PLT_BG[a.platform] || '#3f3f46', color: '#fff', width: 28, height: 28, fontSize: 12 }}
                    >
                      {PLT_ICON[a.platform] || a.platform?.[0]?.toUpperCase()}
                    </div>
                    <span style={{ textTransform: 'capitalize' }}>{a.platform}</span>
                  </div>
                </td>
                <td style={{ fontFamily: 'monospace', color: '#a1a1aa' }}>@{a.username}</td>
                <td>{a.displayName || '—'}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 11, color: '#52525b' }}>{a._id || a.accountId || '—'}</td>
                <td><span className="badge badge-green">Active</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
