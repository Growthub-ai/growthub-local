const BASE = import.meta.env.VITE_ZERNIO_API_URL || 'https://zernio.com/api/v1';
const KEY  = import.meta.env.VITE_ZERNIO_API_KEY  || '';
export const PROFILE_ID = import.meta.env.VITE_ZERNIO_PROFILE_ID || '';

function authHeaders(extra = {}) {
  return { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json', ...extra };
}

async function request(method, path, body, idempotencyKey) {
  const h = authHeaders(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {});
  const opts = { method, headers: h };
  if (body !== undefined) opts.body = JSON.stringify(body);

  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`${BASE}${path}`, opts);
    if (r.status === 429) {
      const wait = (parseInt(r.headers.get('Retry-After') || '5', 10) * 1000) + 500;
      await new Promise(res => setTimeout(res, wait));
      continue;
    }
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      const code = err?.error?.code || '';
      const msg  = err?.error?.message || `HTTP ${r.status}`;
      const e = new Error(msg);
      e.code = code;
      e.status = r.status;
      throw e;
    }
    return r.json();
  }
  throw new Error('Rate limited: max retries reached');
}

const get  = (path)              => request('GET',    path);
const post = (path, body, ikey)  => request('POST',   path, body, ikey);
const put  = (path, body)        => request('PUT',    path, body);
const del  = (path)              => request('DELETE', path);

export const api = {
  // ── Profiles ────────────────────────────────────────────────────────────────
  getProfiles:   ()   => get('/profiles'),
  getProfile:    (id) => get(`/profiles/${id}`),

  // ── Accounts ────────────────────────────────────────────────────────────────
  getAccounts: (profileId) => get(`/accounts?profileId=${profileId}`),

  // ── Posts ───────────────────────────────────────────────────────────────────
  getPosts:    (profileId, status = 'scheduled') => get(`/posts?profileId=${profileId}&status=${status}`),
  getAllPosts:  (profileId) => get(`/posts?profileId=${profileId}`),
  getPost:     (id)         => get(`/posts/${id}`),
  // Normalises the response: API returns { post: {...} } on create
  createPost:  async (body, ikey) => {
    const d = await post('/posts', body, ikey);
    return d.post || d;
  },
  deletePost:  (id)         => del(`/posts/${id}`),

  // ── Queues ──────────────────────────────────────────────────────────────────
  getQueues:    (profileId) => get(`/queues?profileId=${profileId}`),
  createQueue:  (body)      => post('/queues', body),
  updateQueue:  (id, body)  => put(`/queues/${id}`, body),
  deleteQueue:  (id)        => del(`/queues/${id}`),

  // ── Media ───────────────────────────────────────────────────────────────────
  uploadMedia: async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch(`${BASE}/media`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${KEY}` },
      body: fd,
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e?.error?.message || `HTTP ${r.status}`);
    }
    return r.json();
  },
  getMedia: (id) => get(`/media/${id}`),

  // ── Inbox ───────────────────────────────────────────────────────────────────
  getInbox:           (profileId) => get(`/inbox?profileId=${profileId}`),
  getConversation:    (id)        => get(`/inbox/${id}`),
  replyConversation:  (id, body)  => post(`/inbox/${id}/reply`, body),

  // ── Analytics ───────────────────────────────────────────────────────────────
  getPostAnalytics:    (profileId, from, to) => get(`/analytics/posts?profileId=${profileId}&from=${from}&to=${to}`),
  getAccountAnalytics: (profileId, from, to) => get(`/analytics/accounts?profileId=${profileId}&from=${from}&to=${to}`),

  // ── API Keys ─────────────────────────────────────────────────────────────────
  getApiKeys:    ()          => get('/api-keys'),
  createApiKey:  (body)      => post('/api-keys', body),
  deleteApiKey:  (id)        => del(`/api-keys/${id}`),

  // ── Platforms ────────────────────────────────────────────────────────────────
  getPlatforms: () => get('/platforms'),

  // ── Connect ──────────────────────────────────────────────────────────────────
  connectPlatform: (platform) => get(`/connect/${platform}`),

  // ── Contacts ─────────────────────────────────────────────────────────────────
  getContacts:  ()     => get('/contacts'),
  createContact:(body) => post('/contacts', body),

  // ── Broadcasts ───────────────────────────────────────────────────────────────
  getBroadcasts:    ()     => get('/broadcasts'),
  createBroadcast:  (body) => post('/broadcasts', body),
  getBroadcast:     (id)   => get(`/broadcasts/${id}`),

  // ── Sequences ────────────────────────────────────────────────────────────────
  getSequences:   () => get('/sequences'),
  getSequence:    (id) => get(`/sequences/${id}`),
  activateSequence: (id) => post(`/sequences/${id}/activate`, {}),
  pauseSequence:    (id) => post(`/sequences/${id}/pause`, {}),

  // ── Comment-to-DM Automations (Instagram + Facebook only) ───────────────────
  // Real endpoint: POST /api/v1/comment-automations
  // Required: name, profileId, accountId, platformPostId, dmMessage
  // Optional: keywords (comma-separated string), commentReply, isActive
  getCommentAutomations:    (profileId) => get(`/comment-automations${profileId ? '?profileId=' + profileId : ''}`),
  getCommentAutomation:     (id)        => get(`/comment-automations/${id}`),
  createCommentAutomation:  (body)      => post('/comment-automations', body),
  updateCommentAutomation:  (id, body)  => put(`/comment-automations/${id}`, body),
  deleteCommentAutomation:  (id)        => del(`/comment-automations/${id}`),
  getCommentAutomationLogs: (id)        => get(`/comment-automations/${id}/logs`),

  // ── Platform OAuth connect ────────────────────────────────────────────────
  getConnectUrl: (platform, profileId) => get(`/connect/${platform}?profileId=${profileId || PROFILE_ID}`),

  // ── Comments on posts ─────────────────────────────────────────────────────
  getPostComments:  (postId, accountId) => get(`/posts/${postId}/comments?accountId=${accountId}`),
  replyToComment:   (postId, body)      => post(`/posts/${postId}/comments`, body),
  deleteComment:    (postId, commentId, accountId) => del(`/posts/${postId}/comments/${commentId}?accountId=${accountId}`),
  hideComment:      (postId, commentId, body) => post(`/posts/${postId}/comments/${commentId}/hide`, body),

  // ── Legacy stubs (kept for backward compat in Agent view) ────────────────
  getAutomations:    ()          => get('/comment-automations'),
  runAutomation:     (id)        => post(`/comment-automations/${id}/run`, {}),

  // ── Webhooks ─────────────────────────────────────────────────────────────────
  getWebhooks:   () => get('/webhooks'),
  createWebhook: (body) => post('/webhooks', body),
  updateWebhook: (id, body) => put(`/webhooks/${id}`, body),
  getWebhookLogs: (id) => get(`/webhooks/${id}/logs`),
};
