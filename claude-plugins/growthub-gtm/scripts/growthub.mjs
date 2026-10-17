#!/usr/bin/env node
/** Same hosted MCP contracts; credentials stay in the existing process environment. */
import { randomUUID } from 'node:crypto';
const origin = 'https://www.growthub.ai';
const paths = { brand: '/api/v1/mcp', ceo: '/api/v1/mcp/ceo', knowledge: '/api/v1/mcp/knowledge' };
const [command, server, tool] = process.argv.slice(2);
const token = process.env.GROWTHUB_API_TOKEN;
const redact = text => String(text).replaceAll(token || '__no_credential__', '[redacted]').replace(/ghapi_[A-Za-z0-9_-]+/g, 'ghapi_[redacted]');
async function request(path, body) {
  const response = await fetch(origin + path, {
    method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(55_000),
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json, text/event-stream', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body ?? []) {
    size += chunk.byteLength;
    if (size > 8_000_000) throw new Error('Use the installed MCP client for this large resource. No output was truncated or substituted.');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`Growthub returned a non-JSON response (HTTP ${response.status}).`); }
  if (!response.ok) throw new Error(`Growthub HTTP ${response.status}: ${redact(JSON.stringify(data)).slice(0, 1000)}`);
  return data;
}
try {
  if (!token?.startsWith('ghapi_')) throw new Error('Use your existing Growthub API-token settings and GROWTHUB_API_TOKEN environment. Never paste a token into chat.');
  if (command === 'session') {
    console.log(redact(JSON.stringify(await request('/api/cli/session'))));
  } else if (command === 'brand-kits') {
    const data = await request('/api/brand-settings');
    console.log(redact(JSON.stringify({ brandKits: (data.brandKits ?? []).map(kit => ({ id: kit.id, name: kit.brand_name, activeVersionId: kit.active_version_id, activeSemanticVersion: kit.active_semantic_version })) })));
  } else if (command === 'tools' && Object.hasOwn(paths, server)) {
    const data = await request(paths[server], { jsonrpc: '2.0', id: randomUUID(), method: 'tools/list', params: {} });
    console.log(redact(JSON.stringify(data)));
  } else if (command === 'call' && Object.hasOwn(paths, server) && /^[a-z][a-z0-9_]{0,100}$/.test(tool || '')) {
    if (tool === 'decide_api_request') throw new Error('Use the existing Growthub approval surface for this operation.');
    let input = '';
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) {
      input += chunk;
      if (Buffer.byteLength(input) > 1_000_000) throw new Error('Tool input exceeds the bounded request size.');
    }
    const args = input.trim() ? JSON.parse(input) : {};
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Tool input must be a JSON object on stdin.');
    // Never retry a write or invent an operation identity after uncertainty.
    if (['message_character', 'create_character', 'edit_character', 'duplicate_character', 'create_feed_item'].includes(tool) &&
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(args.operationId || ''))
      throw new Error('Supply and retain a UUID operationId for this write before calling it.');
    const data = await request(paths[server], { jsonrpc: '2.0', id: randomUUID(), method: 'tools/call', params: { name: tool, arguments: args } });
    console.log(redact(JSON.stringify(data)));
    if (data.error || data.result?.isError) process.exitCode = 1;
  } else throw new Error('Usage: growthub.mjs session | brand-kits | tools brand|ceo|knowledge | call brand|ceo|knowledge tool < arguments.json');
} catch (error) {
  console.error(redact(error?.message || 'Growthub operation failed.'));
  process.exitCode = 1;
}
