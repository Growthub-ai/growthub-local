/**
 * Pre-init probe — Finalize's real execution proof, on the SAME lane training
 * uses. buildPreInitProbeScript() emits a self-contained Node program that a
 * `model-training-runner` sandbox row carries and POST /api/workspace/sandbox-run
 * executes (intent: custom-model-preinit-probe). It verifies, on the actual
 * machine that will train:
 *
 *   1. eligible-traces   — curated corpus really at/above the fine-tune floor
 *   2. base-model        — the selected base model tag is REALLY installed
 *   3. training-folder   — artifact folder exists (mkdir -p) and accepts a
 *                          real write+delete probe file
 *   4. machine-check     — RAM / free disk / (VRAM when a GPU exists) clear
 *                          the resource floor for this base model
 *   5. training-tools    — python · fine-tune/convert scripts · llama.cpp
 *                          quantize+imatrix · ollama CLI are present
 *   6. model-server      — the local model server answers /api/tags
 *   7. endpoint-200      — a REAL chat-completions call to the registered
 *                          endpoint returns HTTP 200 (base model — this proves
 *                          the serving lane, it never claims a tuned model)
 *
 * It then stamps the pre-init `model-training-run` receipt through the same
 * governed PATCH the training runner uses: `preinit` {ok, checks, endpointStatus}
 * + status prepared (pass) / blocked (fail, plain-language blockedReason).
 * On a 200 it also stamps the api-registry row's lastTested/lastResponse —
 * endpoint authority is recorded from a real response, never assumed. It can
 * NEVER stamp trained/imported/verified: readiness to invoke is the only claim.
 *
 * derivePreInitState() is the pure parser the modal and the Start-training
 * gate read the receipt through — a pass claim without per-check evidence
 * never reads as ok.
 */

import { PYTHON_TRAINING_PACKAGES, hfBaseIdFor } from "./training-pipeline-scripts.js";

export const PREINIT_SCHEMA = "growthub-preinit-probe-v1";
/** model-training-run rows carrying this runKind are probes, not runs. */
export const PREINIT_RUN_KIND = "preinit-probe";
export const PREINIT_INTENT = "custom-model-preinit-probe";
export const SERVER_REPAIR_INTENT = "custom-model-server-repair";

/** Known Ollama binary locations beyond PATH — mirrored in the probe/repair
 *  scripts so a stopped PATH-less install is still found and started. */
export const OLLAMA_BIN_CANDIDATES = [
  "/usr/local/bin/ollama",
  "/opt/homebrew/bin/ollama",
  "/Applications/Ollama.app/Contents/Resources/ollama",
  "/Applications/Ollama.app/Contents/MacOS/ollama",
];

/**
 * One-click "Start model server" repair — a real background script on the
 * same sandbox lane. Finds the server binary (PATH + known app locations),
 * installs it automatically via Homebrew when genuinely absent, starts
 * `ollama serve` DETACHED with OLLAMA_MODELS pointed at the user's real
 * models store (external drives count), and waits until /api/tags answers.
 * The user clicks once; nothing is ever "go install X yourself".
 */
export function buildServerRepairScript({ modelsDir = "", ollamaUrl = "http://127.0.0.1:11434" } = {}) {
  const P = JSON.stringify({
    modelsDir: modelsDir || "",
    ollamaUrl: (ollamaUrl || "http://127.0.0.1:11434").replace(/\/+$/, ""),
    binCandidates: OLLAMA_BIN_CANDIDATES,
    brewCandidates: ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"],
  });
  return [
    "const { execFileSync, spawn } = require('node:child_process');",
    "const fs = require('node:fs');",
    `const P = ${P};`,
    "const findBin = () => { try { const p = execFileSync('which', ['ollama'], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000 }).toString().trim(); if (p) return p; } catch {} for (const c of P.binCandidates) { try { if (fs.existsSync(c)) return c; } catch {} } return ''; };",
    "const up = async () => { try { const r = await fetch(`${P.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(1500) }); return r.ok; } catch { return false; } };",
    "(async () => {",
    "  if (await up()) { console.log('SERVER_UP already running'); return; }",
    "  let bin = findBin();",
    "  if (!bin) {",
    "    const brew = P.brewCandidates.find((b) => { try { return fs.existsSync(b); } catch { return false; } });",
    "    if (!brew) { console.error('Model server app is not on this machine and could not be added automatically.'); process.exit(1); return; }",
    "    console.log('Adding the model server automatically (this can take a few minutes)…');",
    "    try { execFileSync(brew, ['install', 'ollama'], { stdio: 'inherit', timeout: 15 * 60 * 1000 }); } catch (e) { console.error('Automatic install failed: ' + String((e && e.message) || e).split('\\n')[0]); process.exit(1); return; }",
    "    bin = findBin();",
    "    if (!bin) { console.error('Install finished but the server binary was not found.'); process.exit(1); return; }",
    "  }",
    "  const env = { ...process.env };",
    "  if (P.modelsDir) env.OLLAMA_MODELS = P.modelsDir;",
    "  const child = spawn(bin, ['serve'], { detached: true, stdio: 'ignore', env });",
    "  child.unref();",
    "  let ok = false;",
    "  for (let i = 0; i < 30; i += 1) { if (await up()) { ok = true; break; } await new Promise((r) => setTimeout(r, 1000)); }",
    "  if (!ok) { console.error('The model server did not come up within 30 seconds.'); process.exit(1); return; }",
    "  let count = 0; try { const t = await (await fetch(`${P.ollamaUrl}/api/tags`)).json(); count = (t.models || []).length; } catch {}",
    "  console.log('SERVER_UP serving ' + count + ' models' + (P.modelsDir ? ' from ' + P.modelsDir : ''));",
    "})().catch((e) => { console.error(e); process.exit(1); });",
  ].join("\n");
}

/** Parse a pre-init receipt off a model-training-run row. Pure, never throws.
 *  Defensive floor: `ok` requires per-check evidence — an ok:true claim with
 *  no checks (or any failing check) never reads as passed. */
export function derivePreInitState(runRow = {}) {
  let p = runRow?.preinit;
  if (typeof p === "string") { try { p = JSON.parse(p); } catch { p = null; } }
  if (!p || typeof p !== "object" || Array.isArray(p)) {
    return { present: false, ok: false, checks: [], blockedReason: String(runRow?.blockedReason || ""), endpointStatus: null, completedAt: "" };
  }
  const checks = (Array.isArray(p.checks) ? p.checks : []).map((c) => ({
    id: String(c?.id || ""),
    label: String(c?.label || c?.id || ""),
    ok: c?.ok === true,
    detail: String(c?.detail || ""),
    // Advisory checks (blocking:false) are recorded evidence that WARNS but
    // never traps the user — the training run proves those steps for real.
    blocking: c?.blocking !== false,
  }));
  const blockingChecks = checks.filter((c) => c.blocking);
  const ok = p.ok === true && blockingChecks.length > 0 && blockingChecks.every((c) => c.ok);
  const firstFail = blockingChecks.find((c) => !c.ok) || checks.find((c) => !c.ok) || null;
  // A phase marker without final checks = the probe was interrupted mid-phase
  // (kill/timeout/power) — say exactly where, and that Retry resumes.
  const phase = String(p.phase || "");
  const interrupted = !checks.length && phase
    ? `The check was interrupted while ${phase} — press Retry finalize to continue where it left off.`
    : "";
  return {
    present: true,
    ok,
    checks,
    phase,
    blockedReason: ok ? "" : (interrupted || String(runRow?.blockedReason || p.blockedReason || firstFail?.detail || "Pre-init check did not pass.")),
    endpointStatus: Number.isFinite(Number(p.endpointStatus)) ? Number(p.endpointStatus) : null,
    completedAt: String(p.completedAt || ""),
  };
}

/**
 * Emit the pre-init probe program. Same posture as the training runner script:
 * params are embedded as ONE JSON literal (never concatenated into shell
 * strings), every external probe is wrapped, and the program's only writes are
 * the governed PATCH stamps + one throwaway write-probe file it deletes.
 */
export function buildPreInitProbeScript({
  preInitRunId,
  baseModel,
  artifactPath,
  modelTag,
  floor,
  minScore,
  requiredTraces,
  ollamaUrl,
  chatUrl,
  integrationId,
  toolSearchDirs,
  workspaceUrl,
  ollamaBin,
  modelsDir,
  pipelineScripts,
  venvDir,
} = {}) {
  const P = JSON.stringify({
    preInitRunId: preInitRunId || "",
    baseModel: baseModel || "",
    artifactPath: artifactPath || "",
    modelTag: modelTag || "",
    floor: floor || { ramGB: 0, diskGB: 0, vramGB: 0 },
    minScore: Number(minScore) || 4,
    requiredTraces: Number(requiredTraces) || 10,
    ollamaUrl: (ollamaUrl || "http://127.0.0.1:11434").replace(/\/+$/, ""),
    chatUrl: chatUrl || "",
    integrationId: integrationId || "",
    toolSearchDirs: Array.isArray(toolSearchDirs) ? toolSearchDirs : [],
    workspaceUrl: workspaceUrl || "",
    ollamaBin: ollamaBin || "",
    modelsDir: modelsDir || "",
    binCandidates: OLLAMA_BIN_CANDIDATES,
    // The workspace's OWN pipeline files — provisioned automatically here,
    // never user homework.
    pipelineScripts: pipelineScripts && typeof pipelineScripts === "object" ? pipelineScripts : {},
    // Full downstream blast radius: the python packages the fine-tune/merge
    // stages import, the workspace-owned venv they install into (system
    // pythons are PEP 668 externally managed — never fought, always bypassed
    // with our own venv), and the HF id the trainer pulls base weights from.
    pythonPackages: PYTHON_TRAINING_PACKAGES,
    venvDir: venvDir || "",
    hfBaseId: hfBaseIdFor(baseModel),
    brewCandidates: ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"],
    schema: PREINIT_SCHEMA,
  });
  return [
    "const { execFileSync, spawn } = require('node:child_process');",
    "const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');",
    `const P = ${P};`,
    "const WS = (P.workspaceUrl || process.env.GROWTHUB_WORKSPACE_URL || 'http://127.0.0.1:3000').replace(/\\/+$/, '');",
    "const gb = (bytes) => Math.floor(Number(bytes || 0) / 1e9);",
    "const checks = [];",
    "const add = (id, label, ok, detail, blocking = true) => { checks.push({ id, label, ok: Boolean(ok), detail: String(detail || ''), blocking: blocking !== false }); console.log(`CHECK ${ok ? 'PASS' : (blocking !== false ? 'FAIL' : 'WARN')} ${id}: ${detail}`); };",
    "async function patchDataModel(objects) {",
    "  const patch = { dataModel: { objects } };",
    "  const pre = await fetch(`${WS}/api/workspace/patch/preflight`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) });",
    "  const verdict = await pre.json();",
    "  if (!pre.ok || verdict.ok !== true) throw new Error('governed preflight refused: ' + JSON.stringify(verdict.policy?.violations || verdict.schema?.errors || verdict));",
    "  const written = await fetch(`${WS}/api/workspace`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) });",
    "  if (!written.ok) throw new Error('governed PATCH refused: ' + (await written.text()).slice(0, 300));",
    "  return written.json();",
    "}",
    // One governed write lane — identical discipline to the training runner:
    // read the workspace, map ONLY this pre-init run row, PATCH it back.
    "async function stampPreInit(patch, regPatch) {",
    "  try {",
    "    const r = await fetch(`${WS}/api/workspace`, { cache: 'no-store' }); const data = await r.json();",
    "    const objects = (data.workspaceConfig.dataModel.objects || []).map((o) => {",
    "      if (o.objectType === 'model-training-run') return { ...o, rows: (o.rows || []).map((row) => String(row.trainingRunId) === P.preInitRunId ? { ...row, ...patch } : row) };",
    "      if (regPatch && o.objectType === 'api-registry') return { ...o, rows: (o.rows || []).map((row) => String(row.integrationId || '') === P.integrationId ? { ...row, ...regPatch } : row) };",
    "      return o;",
    "    });",
    "    await patchDataModel(objects);",
    "  } catch (e) { console.error('stampPreInit failed', (e && e.message) || e); throw e; }",
    "}",
    // Phase stamp — a governed marker written BEFORE each long operation so
    // an interrupted probe (power loss, kill) always carries evidence of the
    // exact phase it stopped in, and Retry finalize resumes from real state.
    "async function stampPhase(phase) { console.log('PHASE ' + phase); await stampPreInit({ preinit: { schema: P.schema, ok: false, phase, checks: [] } }); }",
    "const BREW_ENV = { ...process.env, HOMEBREW_NO_AUTO_UPDATE: '1', HOMEBREW_NO_ENV_HINTS: '1' };",
    "(async () => {",
    "  await stampPhase('checking this machine');",
    // ---- 0a. provision the workspace's own pipeline scripts (idempotent). --
    "  for (const [name, content] of Object.entries(P.pipelineScripts)) {",
    "    try { const p = path.join(process.cwd(), name); if (!fs.existsSync(p)) { fs.writeFileSync(p, content); console.log('PROVISIONED ' + name); } } catch (e) { console.error('provision failed ' + name, (e && e.message) || e); }",
    "  }",
    // ---- 0b. auto-start the model server if it is installed but stopped. ---
    "  const findBin = () => { if (P.ollamaBin && fs.existsSync(P.ollamaBin)) return P.ollamaBin; try { const p = execFileSync('which', ['ollama'], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000 }).toString().trim(); if (p) return p; } catch {} for (const c of P.binCandidates) { try { if (fs.existsSync(c)) return c; } catch {} } return ''; };",
    "  const serverTags = async () => { try { const r = await fetch(`${P.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(2500) }); if (!r.ok) return null; const t = await r.json(); return (t.models || []).map((m) => String(m.name || '')); } catch { return null; } };",
    "  let tagList = await serverTags();",
    "  let autoStarted = false;",
    "  if (!tagList) {",
    "    let bin = findBin();",
    "    if (!bin) {",
    // The server app itself is MISSING → the pre-init run adds it
    // automatically (Homebrew) — mandatory ensure, never user homework.
    "      const brew = ['/opt/homebrew/bin/brew', '/usr/local/bin/brew'].find((b) => { try { return fs.existsSync(b); } catch { return false; } });",
    "      if (brew) {",
    "        await stampPhase('installing the model server');",
    "        console.log('Adding the model server automatically (this can take a few minutes)…');",
    "        try { execFileSync(brew, ['install', 'ollama'], { stdio: 'inherit', timeout: 25 * 60 * 1000, env: BREW_ENV }); } catch (e) { console.error('automatic install failed: ' + String((e && e.message) || e).split('\\n')[0]); }",
    "        bin = findBin();",
    "      }",
    "    }",
    "    if (bin) {",
    "      await stampPhase('starting the model server');",
    "      const env = { ...process.env };",
    "      if (P.modelsDir) env.OLLAMA_MODELS = P.modelsDir;",
    "      try { const child = spawn(bin, ['serve'], { detached: true, stdio: 'ignore', env }); child.unref(); } catch {}",
    "      for (let i = 0; i < 20 && !tagList; i += 1) { await new Promise((r) => setTimeout(r, 1000)); tagList = await serverTags(); }",
    "      autoStarted = Boolean(tagList);",
    "      if (autoStarted) console.log('SERVER_AUTOSTARTED');",
    "    }",
    "  }",
    "  const serverUp = Boolean(tagList);",
    // ---- 1. eligible traces — read the REAL governed corpus. ---------------
    "  let traceCount = 0;",
    "  try {",
    "    const r = await fetch(`${WS}/api/workspace`, { cache: 'no-store' }); const data = await r.json();",
    "    const obj = (data.workspaceConfig.dataModel.objects || []).find((o) => o.id === 'training-traces');",
    "    traceCount = (obj && Array.isArray(obj.rows) ? obj.rows : []).filter((row) => String(row.redactionStatus || '').toLowerCase() !== 'blocked' && Number(row.qualityScore) >= P.minScore && String(row.inputPrompt || '').trim() && String(row.agentOutput || '').trim()).length;",
    "  } catch {}",
    "  add('eligible-traces', 'Eligible training examples', traceCount >= P.requiredTraces, traceCount >= P.requiredTraces ? `${traceCount} ready · ${P.requiredTraces} needed` : `${traceCount} of ${P.requiredTraces} needed`);",
    // ---- 2. base model available — the live server OR the on-disk model
    // store both count: an installed model is never hidden behind a stopped
    // server process.",
    "  const diskModels = (() => { const out = []; if (!P.modelsDir) return out; try { const lib = path.join(P.modelsDir, 'manifests', 'registry.ollama.ai', 'library'); for (const name of fs.readdirSync(lib)) { if (name.startsWith('.')) continue; try { for (const tag of fs.readdirSync(path.join(lib, name))) { if (!tag.startsWith('.')) out.push(`${name}:${tag}`); } } catch {} } } catch {} return out; })();",
    "  const installed = (tagList || []).includes(P.baseModel) || diskModels.includes(P.baseModel);",
    "  add('base-model', 'Base model available', installed, installed ? `${P.baseModel}${(tagList || []).includes(P.baseModel) ? '' : ' (found in your model files)'}` : `\"${P.baseModel}\" was not found on this machine`);",
    // ---- 3. training folder — real mkdir + write + delete probe. ----------
    "  let folderOk = false; let folderDetail = '';",
    "  const artifactRoot = P.artifactPath ? path.resolve(P.artifactPath) : path.resolve('./artifacts');",
    "  try {",
    "    fs.mkdirSync(artifactRoot, { recursive: true });",
    "    const probeFile = path.join(artifactRoot, '.growthub-preinit-probe');",
    "    fs.writeFileSync(probeFile, P.preInitRunId); fs.unlinkSync(probeFile);",
    "    folderOk = true; folderDetail = artifactRoot;",
    "  } catch (e) { folderDetail = `Selected folder is not writable — ${String((e && e.message) || e).split('\\n')[0]}`; }",
    "  add('training-folder', 'Training folder writable', folderOk, folderDetail);",
    // ---- 4. machine floor — same math as the training preflight. ----------
    "  const ramGB = gb(os.totalmem());",
    "  let diskFreeGB = 0;",
    "  try { const s = fs.statfsSync(folderOk ? artifactRoot : '.'); diskFreeGB = gb(s.bavail * s.bsize); } catch {}",
    "  let gpu = { present: false, name: '', vramFreeGB: 0 };",
    "  try { const out = execFileSync('nvidia-smi', ['--query-gpu=name,memory.free', '--format=csv,noheader,nounits'], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000 }).toString().trim(); if (out) { const [name, freeMiB] = out.split('\\n')[0].split(',').map((s) => s.trim()); gpu = { present: true, name, vramFreeGB: Math.floor(Number(freeMiB) / 1024) }; } } catch {}",
    // Disk at the artifact folder BLOCKS (a run physically needs the space);
    // memory/VRAM shortfalls are honest WARNINGS — training measures again at
    // its own preflight and stops with the real numbers if it truly cannot run.
    "  const diskOk = diskFreeGB >= P.floor.diskGB;",
    "  const warns = [];",
    "  if (ramGB < P.floor.ramGB) warns.push(`memory is tight for this model (${ramGB} GB present, ~${P.floor.ramGB} GB suggested)`);",
    "  if (gpu.present && gpu.vramFreeGB < P.floor.vramGB) warns.push(`graphics memory is tight (${gpu.vramFreeGB} GB free, ~${P.floor.vramGB} GB suggested)`);",
    "  add('machine-check', 'Machine check', diskOk, diskOk ? `Memory ${ramGB} GB · ${diskFreeGB} GB free at the training folder · ${gpu.present ? gpu.name : 'CPU mode'}${warns.length ? ' — ' + warns.join('; ') : ''}` : `Not enough free space at the training folder — needs ~${P.floor.diskGB} GB, ${diskFreeGB} GB available. Pick a folder with more space.`);",
    "  const preflight = { ok: diskOk, ramGB, diskFreeGB, gpu, floor: P.floor, cpuOnly: !gpu.present, warnings: warns };",
    // ---- 5. tooling — full downstream blast radius, ENSURED not just
    // checked: python training packages and llama.cpp quantize tools are
    // installed automatically when absent; only a real install failure
    // (recorded honestly) can block.
    "  const which = (bin) => { try { return execFileSync('which', [bin], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000 }).toString().trim(); } catch { return ''; } };",
    "  const findAsset = (names, extraDirs) => { for (const root of [process.cwd(), ...(extraDirs || [])]) { for (const n of names) { const p = path.join(root, n); if (fs.existsSync(p)) return p; } } return ''; };",
    "  const brew = P.brewCandidates.find((b) => { try { return fs.existsSync(b); } catch { return false; } });",
    "  let searchDirs = [...P.toolSearchDirs.flatMap((d) => [d, path.join(d, 'build/bin')]), '/opt/homebrew/bin', '/usr/local/bin'];",
    // 5a. python packages the fine-tune/merge stages import — installed into
    // the WORKSPACE-OWNED virtualenv (system pythons are PEP 668 externally
    // managed and refuse installs; we never fight them, we own our env).
    "  const sysPy = which('python3') || which('python');",
    "  const venvPy = P.venvDir ? path.join(P.venvDir, 'bin', 'python') : '';",
    "  const pyImportWith = (interp) => { try { execFileSync(interp, ['-c', `import ${P.pythonPackages.join(', ')}`], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 120000 }); return true; } catch { return false; } };",
    "  let py = '';",
    "  let pyDepsOk = false; let pyDepsDetail = '';",
    "  if (!sysPy) { pyDepsDetail = 'Python runtime not found on this machine.'; }",
    "  else {",
    "    if (venvPy && fs.existsSync(venvPy) && pyImportWith(venvPy)) { py = venvPy; pyDepsOk = true; pyDepsDetail = `${P.pythonPackages.join(', ')} ready (workspace training environment)`; }",
    "    else if (pyImportWith(sysPy)) { py = sysPy; pyDepsOk = true; pyDepsDetail = `${P.pythonPackages.join(', ')} ready (${sysPy})`; }",
    "    else if (venvPy) {",
    "      await stampPhase('setting up the training environment');",
    "      try { if (!fs.existsSync(venvPy)) { fs.mkdirSync(path.dirname(P.venvDir), { recursive: true }); execFileSync(sysPy, ['-m', 'venv', P.venvDir], { stdio: 'inherit', timeout: 5 * 60 * 1000 }); } } catch (e) { console.error('venv create failed: ' + String((e && e.message) || e).split('\\n')[0]); }",
    "      if (fs.existsSync(venvPy)) {",
    "        await stampPhase('installing the Python training packages');",
    "        console.log('Installing Python training packages into the workspace environment (torch is large — this can take a while)…');",
    "        try { execFileSync(venvPy, ['-m', 'pip', 'install', '--upgrade', 'pip'], { stdio: 'inherit', timeout: 5 * 60 * 1000 }); } catch {}",
    "        try { execFileSync(venvPy, ['-m', 'pip', 'install', ...P.pythonPackages], { stdio: 'inherit', timeout: 40 * 60 * 1000 }); } catch (e) { console.error('pip install failed: ' + String((e && e.message) || e).split('\\n')[0]); }",
    "        pyDepsOk = pyImportWith(venvPy);",
    "        if (pyDepsOk) py = venvPy;",
    "      }",
    "      pyDepsDetail = pyDepsOk ? `${P.pythonPackages.join(', ')} installed into the workspace training environment` : 'Automatic install of the Python training packages did not finish — press Retry finalize to continue it.';",
    "    } else { pyDepsDetail = 'No location available for the training environment.'; }",
    "  }",
    "  add('python-packages', 'Python training packages', pyDepsOk, pyDepsDetail);",
    // 5b. llama.cpp quantize tools — brew-install automatically when absent.
    "  let quantBin = findAsset(['llama-quantize'], searchDirs) || which('llama-quantize');",
    "  let imatrixBin = findAsset(['llama-imatrix'], searchDirs) || which('llama-imatrix');",
    "  if ((!quantBin || !imatrixBin) && brew) {",
    "    await stampPhase('installing the quantize tools');",
    "    console.log('Adding the quantize tools automatically (brew install llama.cpp)…');",
    "    try { execFileSync(brew, ['install', 'llama.cpp'], { stdio: 'inherit', timeout: 20 * 60 * 1000, env: BREW_ENV }); } catch (e) { console.error('automatic llama.cpp install failed: ' + String((e && e.message) || e).split('\\n')[0]); }",
    "    quantBin = findAsset(['llama-quantize'], searchDirs) || which('llama-quantize');",
    "    imatrixBin = findAsset(['llama-imatrix'], searchDirs) || which('llama-imatrix');",
    "  }",
    "  const missing = [];",
    "  if (!sysPy) missing.push('Python runtime');",
    "  if (!findAsset(['train.py'], [])) missing.push('Fine-tune script');",
    "  if (!findAsset(['convert_hf_to_gguf.py'], searchDirs)) missing.push('Convert script');",
    "  if (!quantBin) missing.push('Quantize tool');",
    "  if (!imatrixBin) missing.push('Importance-matrix tool');",
    "  if (!findBin()) missing.push('Model server app');",
    "  add('training-tools', 'Training tools', missing.length === 0, missing.length === 0 ? 'Fine-tune, convert, quantize, and serve tools all present' : `Could not furnish automatically: ${missing.join(', ')} — retry finalize; a real install failure is recorded above.`);",
    "  add('model-server', 'Local model server', serverUp, serverUp ? `${P.ollamaUrl}${autoStarted ? ' (started automatically)' : ''}` : 'Could not start the model server automatically — retry finalize.');",
    // 5c. base weights reachability — the trainer pulls the HF weights for
    // the selected base; a license-gated model needs the user's HF token
    // (the ONE thing that cannot be furnished automatically). WARN + exact fix.
    "  let weightsOk = false; let weightsDetail = '';",
    "  if (pyDepsOk && P.hfBaseId) {",
    "    try { execFileSync(py, ['-c', `from huggingface_hub import model_info; model_info('${P.hfBaseId}')`], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 60000 }); weightsOk = true; weightsDetail = `${P.hfBaseId} reachable`; }",
    "    catch (e) { weightsDetail = `Base weights ${P.hfBaseId} not reachable yet — if the model is license-gated, accept its license and set HF_TOKEN; training stops honestly at fine-tune otherwise.`; }",
    "  } else { weightsDetail = 'Checked once the Python packages are ready.'; }",
    "  add('base-weights', 'Base model weights reachable', weightsOk, weightsDetail, false);",
    // ---- 7. REAL chat-completions 200 against the registered endpoint —
    // required when the server is up (never fake a 200); recorded as a
    // warning when there is no server to ask yet.
    "  let endpointStatus = 0; let chatBody = null; let served = '';",
    "  if (P.chatUrl && serverUp) {",
    "    try {",
    "      const cr = await fetch(P.chatUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: P.baseModel, messages: [{ role: 'user', content: 'Reply with one short line to confirm this endpoint is live.' }], stream: false }), signal: AbortSignal.timeout(180000) });",
    "      endpointStatus = cr.status;",
    "      const ct = await cr.text(); try { chatBody = JSON.parse(ct); } catch { chatBody = ct; }",
    "      served = (chatBody && typeof chatBody === 'object') ? String(chatBody.model || '') : '';",
    "    } catch (e) { chatBody = { error: { message: String((e && e.message) || e) } }; }",
    "  }",
    "  const endpointOk = endpointStatus === 200;",
    "  add('endpoint-200', 'Endpoint answered 200', endpointOk, endpointOk ? `HTTP 200 · replied as ${served || 'unknown model'}` : serverUp ? (endpointStatus ? `HTTP ${endpointStatus} — the endpoint did not accept a chat request` : 'No reply from the endpoint') : 'Checked automatically once the model server is running.', serverUp);",
    // ---- stamp the governed pre-init receipt (+ real endpoint record). ----
    "  const blocking = checks.filter((c) => c.blocking !== false);",
    "  const ok = blocking.every((c) => c.ok);",
    "  const failed = blocking.filter((c) => !c.ok);",
    "  const blockedReason = ok ? '' : failed.map((c) => c.detail).join(' · ');",
    "  const now = new Date().toISOString();",
    "  const regPatch = endpointOk ? { lastTested: now, lastResponse: typeof chatBody === 'string' ? chatBody : JSON.stringify(chatBody || '') } : null;",
    "  await stampPreInit({",
    "    status: ok ? 'prepared' : 'blocked',",
    "    blockedReason,",
    "    preflight,",
    "    preinit: { schema: P.schema, ok, checks, endpointStatus, completedAt: now },",
    "  }, regPatch);",
    "  console.log('PREINIT_COMPLETE', ok ? 'PASS' : 'FAIL', `${checks.filter((c) => c.ok).length}/${checks.length}`);",
    "  if (!ok) { console.error(blockedReason); process.exit(1); }",
    "})().catch((e) => { console.error(e); process.exit(1); });",
  ].join("\n");
}
