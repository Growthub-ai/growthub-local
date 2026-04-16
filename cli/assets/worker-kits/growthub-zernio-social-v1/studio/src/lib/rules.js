/**
 * Comment Automation Rules — localStorage store
 *
 * /api/v1/automations is not yet live on this plan.
 * Rules are stored locally and will sync to the API when the endpoint
 * becomes available. Each rule carries a `syncStatus` field:
 *   'local'  — stored only in localStorage
 *   'synced' — confirmed on Zernio API (has a real automationId)
 *   'error'  — last sync attempt failed
 */

const STORAGE_KEY = 'zernio_comment_rules_v1';

function read() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function write(rules) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}

export function getRules() { return read(); }

export function getRulesForPost(postId) {
  return read().filter(r => r.trigger?.postId === postId);
}

export function saveRule(rule) {
  const all = read();
  if (rule.id) {
    const idx = all.findIndex(r => r.id === rule.id);
    const updated = { ...rule, updatedAt: new Date().toISOString() };
    if (idx >= 0) all[idx] = updated; else all.push(updated);
  } else {
    all.push({ ...rule, id: `cr_${Date.now()}`, syncStatus: 'local', createdAt: new Date().toISOString() });
  }
  write(all);
  return getRulesForPost(rule.trigger?.postId);
}

export function deleteRule(id) {
  write(read().filter(r => r.id !== id));
}

export function updateRuleStatus(id, status) {
  const all = read();
  const idx = all.findIndex(r => r.id === id);
  if (idx >= 0) all[idx] = { ...all[idx], status, updatedAt: new Date().toISOString() };
  write(all);
}

export function markSynced(id, automationId) {
  const all = read();
  const idx = all.findIndex(r => r.id === id);
  if (idx >= 0) all[idx] = { ...all[idx], syncStatus: 'synced', automationId };
  write(all);
}

export function exportRules() {
  const blob = new Blob([JSON.stringify(read(), null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `zernio-rules-${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(url);
}
