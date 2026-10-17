#!/usr/bin/env node
/** Offline, streaming report from explicit request/citation evidence; never a crawler or timer. */
import { createReadStream, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  if (!['--requests', '--renders', '--citations', '--out'].includes(process.argv[i]) || !process.argv[i+1]) throw new Error('Usage: report-gtm-discovery.mjs [--requests normalized.jsonl] [--renders origin-events.jsonl] [--citations samples.jsonl] --out report.json');
  options[process.argv[i].slice(2)] = resolve(process.argv[i+1]);
}
if (!options.out || (!options.requests && !options.renders && !options.citations)) throw new Error('Supply at least one actual evidence file and an output path. No sample data is assumed.');
if (Object.values(options).filter(x => x === options.out).length > 1 || existsSync(options.out)) throw new Error('Choose a new output path; never overwrite evidence.');
const origins = new Set(['www.growthub.ai', 'growthub.ai']);
function template(value) {
  try { const u = new URL(value, 'https://www.growthub.ai'); return origins.has(u.hostname) && /^\/f\/playbook\/[a-z0-9-]+$/.test(u.pathname) ? u.pathname : null; } catch { return null; }
}
function referral(value) {
  try { return new Map([['chatgpt.com','chatgpt'],['chat.openai.com','chatgpt'],['claude.ai','claude'],['perplexity.ai','perplexity'],['www.perplexity.ai','perplexity']]).get(new URL(value).hostname) ?? null; } catch { return null; }
}
function bot(ua = '') {
  const tokens = [['OAI-SearchBot','openai-search'],['ChatGPT-User','openai-user-fetch'],['GPTBot','openai-training'],['Claude-SearchBot','claude-search'],['Claude-User','claude-user-fetch'],['ClaudeBot','claude-training'],['PerplexityBot','perplexity-search'],['Perplexity-User','perplexity-user-fetch']];
  return tokens.find(([token]) => ua.includes(token))?.[1] ?? null;
}
const report = { generatedAt: new Date().toISOString(), requestEvidence: options.requests ? 'supplied' : 'unavailable', renderEvidence: options.renders ? 'supplied' : 'unavailable', originRenders: Object.create(null), citationEvidence: options.citations ? 'supplied' : 'unavailable', rowsRead: 0, rejectedRows: 0, duplicateRequestIds: 0, requests: Object.create(null), citations: Object.create(null), limitations: ['Crawler labels are unverified user-agent observations, not verified provider IP identity.', 'AI referrers are request observations, not inferred human clicks or citations.', 'Citation rates describe the supplied prompt sample only; answer evidence is retained outside this aggregate.', 'Origin renders are separate from CDN request status or delivery; marked QA probes are excluded from observed render totals.', 'No install, activation, conversion or revenue is inferred. Missing sources are unavailable, not zero.'] };
const seen = new Set();
async function rows(file, consume) {
  if (statSync(file).size > 64_000_000) throw new Error('Split evidence into files below 64 MB.');
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    report.rowsRead++;
    if (report.rowsRead > 100_000) throw new Error('Split evidence into batches below 100,000 observations.');
    if (Buffer.byteLength(line) > 1_000_000) { report.rejectedRows++; continue; }
    try { await consume(JSON.parse(line)); } catch { report.rejectedRows++; }
  }
}
if (options.requests) await rows(options.requests, row => {
  const path = template(row.path);
  if (!path || !Number.isFinite(Date.parse(row.observedAt)) || !Number.isInteger(row.status) || row.status < 100 || row.status > 599) throw Error('Incomplete request observation');
  if (typeof row.requestId === 'string' && row.requestId) { if (seen.has(row.requestId)) { report.duplicateRequestIds++; return; } seen.add(row.requestId); }
  const type = bot(row.userAgent), ref = referral(row.referrer);
  const item = report.requests[path] ??= { observedRecords: 0, status: {}, userAgentClasses: {}, aiReferrers: {} };
  item.observedRecords++; item.status[row.status] = (item.status[row.status] ?? 0) + 1;
  if (type) item.userAgentClasses[type] = (item.userAgentClasses[type] ?? 0) + 1;
  if (ref) item.aiReferrers[ref] = (item.aiReferrers[ref] ?? 0) + 1;
});
if (options.renders) await rows(options.renders, row => {
  const path = template(row.path), type = bot(row.userAgent);
  if (row.event !== 'growthub.template-discovery.v1' || row.observationType !== 'origin-render' || row.identity !== 'user-agent-unverified' || !path || !type || row.botClass !== type || typeof row.probe !== 'boolean' || !Number.isFinite(Date.parse(row.observedAt))) throw Error('Incomplete origin-render observation');
  const item = report.originRenders[path] ??= { observedRecords: 0, qaProbeRecords: 0, userAgentClasses: {} };
  if (row.probe) { item.qaProbeRecords++; return; }
  item.observedRecords++; item.userAgentClasses[type] = (item.userAgentClasses[type] ?? 0) + 1;
});
if (options.citations) await rows(options.citations, row => {
  if (typeof row.provider !== 'string' || !/^[a-z0-9._-]{1,80}$/i.test(row.provider) || !row.queryId || !Number.isFinite(Date.parse(row.observedAt)) || typeof row.answerFile !== 'string' || !Array.isArray(row.citedUrls)) throw Error('Incomplete citation record');
  const answerPath = resolve(dirname(options.citations), row.answerFile);
  if (statSync(answerPath).size > 2_000_000) throw Error('Use a bounded answer evidence file');
  const bytes = readFileSync(answerPath);
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== row.answerSha256) throw Error('Answer evidence mismatch');
  const answer = bytes.toString('utf8');
  if (row.citedUrls.some(url => typeof url !== 'string' || !answer.includes(url))) throw Error('Citation absent from retained answer');
  const sample = report.citations[row.provider] ??= { observedAnswers: 0, answersCitingGrowthub: 0, citedTemplates: {} };
  const templates = [...new Set(row.citedUrls.map(template).filter(Boolean))];
  sample.observedAnswers++;
  if (templates.length) sample.answersCitingGrowthub++;
  for (const path of templates) sample.citedTemplates[path] = (sample.citedTemplates[path] ?? 0) + 1;
});
for (const sample of Object.values(report.citations)) sample.sampleCitationRate = sample.observedAnswers ? sample.answersCitingGrowthub / sample.observedAnswers : null;
writeFileSync(options.out, JSON.stringify(report,null,2)+'\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ output: options.out, rowsRead: report.rowsRead, rejectedRows: report.rejectedRows, requestEvidence: report.requestEvidence, renderEvidence: report.renderEvidence, citationEvidence: report.citationEvidence }));
