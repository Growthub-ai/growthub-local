import { useState, useEffect, createContext, useContext } from 'react';
import { api, PROFILE_ID } from './api.js';
import Dashboard    from './views/Dashboard.jsx';
import Accounts     from './views/Accounts.jsx';
import Compose      from './views/Compose.jsx';
import Scheduled    from './views/Scheduled.jsx';
import Queues       from './views/Queues.jsx';
import Analytics    from './views/Analytics.jsx';
import Agent        from './views/Agent.jsx';
import ApiKeys      from './views/ApiKeys.jsx';
import Automations  from './views/Automations.jsx';
import Templates    from './views/Templates.jsx';
import CommentRules from './views/CommentRules.jsx';
import Sequences    from './views/Sequences.jsx';

export const AppCtx = createContext({});
export const useApp = () => useContext(AppCtx);

const NAV = [
  { section: 'Publishing' },
  { id: 'dashboard', label: 'Dashboard',  icon: '🏠' },
  { id: 'accounts',  label: 'Accounts',   icon: '🔗' },
  { id: 'compose',   label: 'Compose',    icon: '✏️' },
  { id: 'scheduled', label: 'Scheduled',  icon: '📅' },
  { id: 'queues',    label: 'Queues',     icon: '🔄' },
  { id: 'analytics', label: 'Analytics',  icon: '📊' },
  { section: 'Comment Automation' },
  { id: 'templates',    label: 'Templates',     icon: '📝' },
  { id: 'commentrules', label: 'Comment Rules',  icon: '💬' },
  { id: 'sequences',    label: 'Sequences',      icon: '🔀' },
  { id: 'automations',  label: 'Automations',    icon: '⚡' },
  { section: 'Agent' },
  { id: 'agent',   label: 'Agent / Swarm', icon: '🤖' },
  { id: 'apikeys', label: 'API Keys',      icon: '🔑' },
];

const VIEWS = {
  dashboard:    Dashboard,
  accounts:     Accounts,
  compose:      Compose,
  scheduled:    Scheduled,
  queues:       Queues,
  analytics:    Analytics,
  agent:        Agent,
  automations:  Automations,
  apikeys:      ApiKeys,
  templates:    Templates,
  commentrules: CommentRules,
  sequences:    Sequences,
};

export default function App() {
  const [view, setView]       = useState('dashboard');
  const [profile, setProfile] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [toast, setToast]     = useState(null);
  const [toastOk, setToastOk] = useState(true);

  const showToast = (msg, ok = true) => {
    setToast(msg);
    setToastOk(ok);
    setTimeout(() => setToast(null), 3500);
  };

  const reload = () => {
    if (!PROFILE_ID) return;
    Promise.all([api.getProfile(PROFILE_ID), api.getAccounts(PROFILE_ID)])
      .then(([prof, accs]) => {
        setProfile(prof);
        setAccounts(accs.accounts || []);
      })
      .catch(e => showToast(e.message, false));
  };

  useEffect(reload, []);

  const Current = VIEWS[view] || Dashboard;
  const navLabel = NAV.find(n => n.id === view)?.label || '';

  return (
    <AppCtx.Provider value={{ profile, accounts, PROFILE_ID, showToast, reload }}>
      <div className="layout">
        <nav className="sidebar">
          <div className="logo">⚡ Growthub</div>

          {NAV.map((item, i) =>
            item.section
              ? <div key={i} className="nav-section">{item.section}</div>
              : (
                <button
                  key={item.id}
                  className={`nav-item ${view === item.id ? 'active' : ''}`}
                  onClick={() => setView(item.id)}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </button>
              )
          )}

          <div className="sidebar-bottom">
            <div className="account-badge">
              <span className="dot" />
              <span>{profile?.name || (PROFILE_ID ? 'Loading…' : 'No profile set')}</span>
            </div>
          </div>
        </nav>

        <div className="main">
          <div className="topbar">
            <span className="topbar-title">{navLabel}</span>
            <div className="row">
              <button className="btn btn-ghost btn-sm" onClick={reload}>↻ Refresh</button>
              <button className="btn btn-primary btn-sm" onClick={() => setView('compose')}>+ New Post</button>
            </div>
          </div>
          <div className="content">
            <Current onNavigate={setView} />
          </div>
        </div>
      </div>

      {toast && (
        <div className={`toast ${toastOk ? 'toast-ok' : 'toast-err'}`}>
          {toast}
        </div>
      )}
    </AppCtx.Provider>
  );
}
