#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const write = (rel, content) => fs.writeFileSync(path.join(root, rel), content);

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`[data-plane] missing anchor: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`[data-plane] ambiguous anchor: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function replaceOrSkip(source, before, after, marker, label) {
  if (source.includes(before)) return replaceOnce(source, before, after, label);
  if (marker && source.includes(marker)) return source;
  throw new Error(`[data-plane] neither old nor wired form found: ${label}`);
}

// ---------------------------------------------------------------------------
// Browser/server canonical bytes and durable export membership.
// ---------------------------------------------------------------------------
const modalPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/data-model/components/TrainingHandoffModal.jsx";
let modal = read(modalPath);
modal = replaceOrSkip(
  modal,
  `import { buildMothershipProxyRow } from "../../../lib/distillation-fleet.js";\n\nconst PHASE3_INSTRUCTION = "You are growthub-local-expert. Respect AWaC V2 invariants and the PATCH allowlist.";`,
  `import { buildMothershipProxyRow } from "../../../lib/distillation-fleet.js";\nimport { trainingTraceToJsonlLine } from "../../../lib/training-dataset.js";`,
  `from "../../../lib/training-dataset.js"`,
  "shared dataset serializer import",
);
modal = replaceOrSkip(
  modal,
  `function toJsonlLine(row) {\n  return \`${"${JSON.stringify({ instruction: PHASE3_INSTRUCTION, input: String(row.inputPrompt), output: String(row.agentOutput) })}\\n"}\`;\n}`,
  `function toJsonlLine(row) {\n  return trainingTraceToJsonlLine(row);\n}`,
  `return trainingTraceToJsonlLine(row);`,
  "shared JSONL line projection",
);
modal = replaceOrSkip(
  modal,
  `      const selectedIdx = new Set(selected.map(({ index }) => index));`,
  `      const selectedIdx = new Set(selected.map(({ index }) => index));\n      const selectedOrder = new Map(selected.map(({ index }, ordinal) => [index, ordinal]));`,
  `const selectedOrder = new Map`,
  "export order map",
);
modal = replaceOrSkip(
  modal,
  `          if (o?.id === TRACES_OBJECT_ID) return { ...o, rows: (o.rows || []).map((row, i) => (selectedIdx.has(i) ? { ...row, exported: "true" } : row)) };`,
  `          if (o?.id === TRACES_OBJECT_ID) return {\n            ...o,\n            rows: (o.rows || []).map((row, i) => {\n              if (!selectedIdx.has(i)) return row;\n              const previousIds = Array.isArray(row?.trainingExportIds) ? row.trainingExportIds.map(String) : [];\n              return {\n                ...row,\n                exported: "true",\n                lastExportId: exportId,\n                datasetExportId: exportId,\n                exportOrdinal: selectedOrder.get(i),\n                trainingExportIds: [...new Set([...previousIds, exportId])].slice(-32),\n              };\n            }),\n          };`,
  `trainingExportIds: [...new Set`,
  "trace export identity stamps",
);
write(modalPath, modal);

// ---------------------------------------------------------------------------
// Data-plane hardening: multi-export membership, HTTPS production grants,
// manifest-bound tokens, and idempotent delivery receipts.
// ---------------------------------------------------------------------------
const dataPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-data-plane.js";
let dataPlane = read(dataPath);
dataPlane = replaceOrSkip(
  dataPlane,
  `function exportedRowsFor(workspaceConfig, datasetExportId) {\n  return traceRows(workspaceConfig)\n    .filter((row) => str(row?.lastExportId || row?.datasetExportId) === str(datasetExportId))`,
  `function exportedRowsFor(workspaceConfig, datasetExportId) {\n  const wanted = str(datasetExportId);\n  return traceRows(workspaceConfig)\n    .filter((row) => {\n      const historical = Array.isArray(row?.trainingExportIds) ? row.trainingExportIds.map(str) : [];\n      return str(row?.lastExportId || row?.datasetExportId) === wanted || historical.includes(wanted);\n    })`,
  `const historical = Array.isArray(row?.trainingExportIds)`,
  "multi-export trace membership",
);
dataPlane = replaceOrSkip(
  dataPlane,
  `  const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);\n  if (str(env?.NODE_ENV).toLowerCase() === "production" && url.protocol !== "https:" && !loopback) return null;`,
  `  // Production grants are bearer capabilities crossing a remote provider\n  // boundary. HTTPS is mandatory even for a loopback-looking hostname; local\n  // HTTP is reserved for explicit development/certification environments.\n  if (str(env?.NODE_ENV).toLowerCase() === "production" && url.protocol !== "https:") return null;`,
  `Production grants are bearer capabilities`,
  "production HTTPS grant policy",
);
dataPlane = replaceOrSkip(
  dataPlane,
  `  const payload = {\n    version: 1,\n    trainingRunId: str(trainingRunId),\n    workSpecHash: str(workSpecHash),\n    corpusSha256: str(manifest.corpusSha256),\n    sizeBytes: Math.max(0, Math.floor(Number(manifest.sizeBytes) || 0)),\n    recordCount: Math.max(0, Math.floor(Number(manifest.recordCount) || 0)),\n    issuedAt: new Date(issuedAtMs).toISOString(),\n    expiresAt: new Date(issuedAtMs + ttl * 1000).toISOString(),\n  };`,
  `  const payload = {\n    version: 1,\n    trainingRunId: str(trainingRunId),\n    workSpecHash: str(workSpecHash),\n    exportId: str(manifest.exportId),\n    manifestHash: str(manifest.manifestHash),\n    corpusSha256: str(manifest.corpusSha256),\n    sizeBytes: Math.max(0, Math.floor(Number(manifest.sizeBytes) || 0)),\n    recordCount: Math.max(0, Math.floor(Number(manifest.recordCount) || 0)),\n    issuedAt: new Date(issuedAtMs).toISOString(),\n    expiresAt: new Date(issuedAtMs + ttl * 1000).toISOString(),\n  };`,
  `manifestHash: str(manifest.manifestHash)`,
  "manifest-bound token payload",
);
dataPlane = replaceOrSkip(
  dataPlane,
  `      tokenId: payload.tokenId,\n      expiresAt: payload.expiresAt,\n      corpusSha256: payload.corpusSha256,\n      sizeBytes: payload.sizeBytes,\n      recordCount: payload.recordCount,\n      deliveryStatus: "issued",`,
  `      tokenId: payload.tokenId,\n      issuedAt: payload.issuedAt,\n      expiresAt: payload.expiresAt,\n      trainingRunId: payload.trainingRunId,\n      workSpecHash: payload.workSpecHash,\n      exportId: payload.exportId,\n      manifestHash: payload.manifestHash,\n      corpusSha256: payload.corpusSha256,\n      sizeBytes: payload.sizeBytes,\n      recordCount: payload.recordCount,\n      deliveryStatus: "issued",`,
  `deliveryStatus: "issued",\n      manifestHash: payload.manifestHash`,
  "secret-free access evidence lineage",
);
dataPlane = replaceOrSkip(
  dataPlane,
  `async function writeDeliveryReceipt(payload, env = process.env) {\n  const key = resolveRootSigningKey(env);\n  if (!key) throw new Error("dataset signing key is unavailable");\n  const body = {\n    schema: COMPUTE_DATA_DELIVERY_SCHEMA,\n    tokenId: str(payload.tokenId),\n    trainingRunId: str(payload.trainingRunId),\n    workSpecHash: str(payload.workSpecHash),\n    corpusSha256: str(payload.corpusSha256),\n    sizeBytes: Number(payload.sizeBytes) || 0,\n    recordCount: Number(payload.recordCount) || 0,\n    deliveredAt: new Date().toISOString(),\n  };\n  await atomicWrite(deliveryPathForToken(body.tokenId, env), Buffer.from(\`${"${JSON.stringify({ ...body, signature: deliverySignature(body, key) }, null, 2)}\\n"}\`, "utf8"));\n}`,
  `async function writeDeliveryReceipt(payload, env = process.env) {\n  const key = resolveRootSigningKey(env);\n  if (!key) throw new Error("dataset signing key is unavailable");\n  const body = {\n    schema: COMPUTE_DATA_DELIVERY_SCHEMA,\n    tokenId: str(payload.tokenId),\n    trainingRunId: str(payload.trainingRunId),\n    workSpecHash: str(payload.workSpecHash),\n    exportId: str(payload.exportId),\n    manifestHash: str(payload.manifestHash),\n    corpusSha256: str(payload.corpusSha256),\n    sizeBytes: Number(payload.sizeBytes) || 0,\n    recordCount: Number(payload.recordCount) || 0,\n    deliveredAt: new Date().toISOString(),\n  };\n  const record = { ...body, signature: deliverySignature(body, key) };\n  const receiptPath = deliveryPathForToken(body.tokenId, env);\n  try {\n    const existing = JSON.parse(await fs.readFile(receiptPath, "utf8"));\n    const comparable = { ...existing, deliveredAt: body.deliveredAt };\n    if (stableStringify(comparable) === stableStringify(record)) return existing;\n    throw new Error("dataset delivery receipt identity collision");\n  } catch (error) {\n    if (error?.code !== "ENOENT" && !/Unexpected token|JSON/.test(str(error?.message))) throw error;\n  }\n  try {\n    await atomicWrite(receiptPath, Buffer.from(\`${"${JSON.stringify(record, null, 2)}\\n"}\`, "utf8"));\n  } catch (error) {\n    if (error?.code !== "EEXIST") throw error;\n    const existing = JSON.parse(await fs.readFile(receiptPath, "utf8"));\n    if (str(existing?.tokenId) !== body.tokenId || str(existing?.corpusSha256) !== body.corpusSha256) throw error;\n  }\n  return record;\n}`,
  `dataset delivery receipt identity collision`,
  "idempotent delivery receipt",
);
dataPlane = replaceOrSkip(
  dataPlane,
  `  if (!key || str(signature) !== deliverySignature(body, key)) return failure("dataset-delivery-invalid", "dataset delivery receipt signature does not verify");`,
  `  const expectedSignature = key ? deliverySignature(body, key) : "";\n  const expectedBytes = Buffer.from(expectedSignature, "utf8");\n  const suppliedBytes = Buffer.from(str(signature), "utf8");\n  if (!key || expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {\n    return failure("dataset-delivery-invalid", "dataset delivery receipt signature does not verify");\n  }`,
  `const expectedSignature = key ? deliverySignature`,
  "constant-time delivery signature",
);
dataPlane = replaceOrSkip(
  dataPlane,
  `  if (str(body.trainingRunId) !== str(workSpec?.trainingRunId)\n    || str(body.workSpecHash) !== str(workSpec?.workSpecHash)\n    || str(body.corpusSha256) !== expectedSha\n    || str(evidence?.corpusSha256) !== expectedSha) {`,
  `  if (str(body.trainingRunId) !== str(workSpec?.trainingRunId)\n    || str(body.workSpecHash) !== str(workSpec?.workSpecHash)\n    || str(body.exportId) !== str(workSpec?.dataset?.exportId)\n    || str(body.manifestHash) !== str(evidence?.manifestHash)\n    || str(body.corpusSha256) !== expectedSha\n    || str(evidence?.corpusSha256) !== expectedSha) {`,
  `str(body.manifestHash) !== str(evidence?.manifestHash)`,
  "delivery manifest/export binding",
);
write(dataPath, dataPlane);

// ---------------------------------------------------------------------------
// Receipt-safe dataset evidence.
// ---------------------------------------------------------------------------
const evidencePath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-evidence.js";
let evidence = read(evidencePath);
evidence = replaceOrSkip(
  evidence,
  `export function normalizeComputeArtifactRef(raw) {`,
  `export function normalizeComputeDatasetEvidence(raw) {\n  if (!raw || typeof raw !== "object") return null;\n  return {\n    schema: str(raw.schema).trim(),\n    tokenId: str(raw.tokenId).trim(),\n    issuedAt: str(raw.issuedAt).trim(),\n    expiresAt: str(raw.expiresAt).trim(),\n    trainingRunId: str(raw.trainingRunId).trim(),\n    workSpecHash: str(raw.workSpecHash).trim(),\n    exportId: str(raw.exportId).trim(),\n    manifestHash: str(raw.manifestHash).trim(),\n    corpusSha256: str(raw.corpusSha256).trim(),\n    sizeBytes: Math.max(0, Math.floor(num(raw.sizeBytes))),\n    recordCount: Math.max(0, Math.floor(num(raw.recordCount))),\n    deliveryStatus: ["issued", "delivered", "unverified"].includes(raw.deliveryStatus) ? raw.deliveryStatus : "issued",\n    deliveredAt: str(raw.deliveredAt).trim(),\n    reasonCode: str(raw.reasonCode).trim(),\n  };\n}\n\nexport function normalizeComputeArtifactRef(raw) {`,
  `export function normalizeComputeDatasetEvidence`,
  "dataset evidence normalizer",
);
evidence = replaceOrSkip(
  evidence,
  `    evaluation: raw.evaluation && typeof raw.evaluation === "object" ? raw.evaluation : null,\n    decision,`,
  `    evaluation: raw.evaluation && typeof raw.evaluation === "object" ? raw.evaluation : null,\n    // Receipt-safe data-plane evidence only. The bearer URI/token never enters\n    // the compute journal; adapters receive it through ephemeral call context.\n    dataset: normalizeComputeDatasetEvidence(raw.dataset),\n    decision,`,
  `dataset: normalizeComputeDatasetEvidence(raw.dataset)`,
  "dataset evidence in block",
);
write(evidencePath, evidence);

// ---------------------------------------------------------------------------
// Execution seam: pass the capability only to the provider, persist only safe
// evidence, and refuse artifact verification until delivery is proven.
// ---------------------------------------------------------------------------
const executionPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/compute-execution.js";
let execution = read(executionPath);
execution = replaceOrSkip(
  execution,
  `    capabilities: incoming.capabilities || prior.capabilities,\n    allocation: incoming.allocation || prior.allocation,`,
  `    capabilities: incoming.capabilities || prior.capabilities,\n    dataset: incoming.dataset || prior.dataset\n      ? { ...(prior.dataset || {}), ...(incoming.dataset || {}) }\n      : null,\n    allocation: incoming.allocation || prior.allocation,`,
  `dataset: incoming.dataset || prior.dataset`,
  "monotonic dataset evidence merge",
);
execution = replaceOrSkip(
  execution,
  `  workSpec = null,\n}) {`,
  `  workSpec = null,\n  datasetAccess = null,\n}) {`,
  `datasetAccess = null`,
  "base context dataset access parameter",
);
execution = replaceOrSkip(
  execution,
  `    workSpecHash: str(workSpec?.workSpecHash),\n    providerConfig: providerConfig || {},`,
  `    workSpecHash: str(workSpec?.workSpecHash),\n    // Short-lived bearer capability. It exists only in adapter call context\n    // and is deliberately excluded from every normalized receipt shape.\n    datasetAccess: datasetAccess && typeof datasetAccess === "object" ? datasetAccess : null,\n    providerConfig: providerConfig || {},`,
  `datasetAccess: datasetAccess && typeof datasetAccess`,
  "ephemeral adapter dataset capability",
);
execution = replaceOrSkip(
  execution,
  `  authority = null,\n  io = null,`,
  `  authority = null,\n  datasetAccess = null,\n  datasetEvidence = null,\n  io = null,`,
  `datasetEvidence = null`,
  "executor data-plane parameters",
);
execution = replaceOrSkip(
  execution,
  `      workSpec,\n    });`,
  `      workSpec,\n      datasetAccess,\n    });`,
  `workSpec,\n      datasetAccess,`,
  "quote context dataset access",
);
// The same baseCtx shape occurs later for the selected provider. Replace all
// remaining exact workSpec terminators without touching resume/cancel contexts.
execution = execution.replace(
  `    intent,\n    workSpec,\n  });\n\n  if (!allocation)`,
  `    intent,\n    workSpec,\n    datasetAccess,\n  });\n\n  if (!allocation)`,
);
execution = replaceOrSkip(
  execution,
  `      policy,\n      evidenceObservedAt: nowIso(io),`,
  `      policy,\n      dataset: datasetEvidence,\n      evidenceObservedAt: nowIso(io),`,
  `dataset: datasetEvidence,\n      evidenceObservedAt`,
  "blocked decision data evidence",
);
execution = replaceOrSkip(
  execution,
  `    capabilities: capabilitiesById[selectedId] || prior?.capabilities || null,\n    events,`,
  `    capabilities: capabilitiesById[selectedId] || prior?.capabilities || null,\n    dataset: datasetEvidence || prior?.dataset || null,\n    events,`,
  `dataset: datasetEvidence || prior?.dataset`,
  "execution block data evidence",
);
execution = replaceOrSkip(
  execution,
  `  let artifact = prior?.artifact || null;\n  if (lifecycle.terminal === "completed" && !artifact && typeof adapter.collectArtifact === "function") {`,
  `  let artifact = prior?.artifact || null;\n  let dataEvidence = datasetEvidence || prior?.dataset || null;\n  let datasetDeliveryReason = "";\n  let deliveryVerified = dataEvidence?.deliveryStatus === "delivered";\n  if (!deliveryVerified && lifecycle.terminal === "completed" && typeof io.verifyDatasetDelivery === "function") {\n    const delivery = await safeCall(() => io.verifyDatasetDelivery({ evidence: dataEvidence, workSpec }));\n    if (!delivery?.__error && delivery?.ok === true) {\n      deliveryVerified = true;\n      dataEvidence = {\n        ...dataEvidence,\n        deliveryStatus: "delivered",\n        deliveredAt: str(delivery.receipt?.deliveredAt),\n        reasonCode: "",\n      };\n    } else {\n      datasetDeliveryReason = str(delivery?.reason || delivery?.__error || "dataset delivery could not be proven");\n      dataEvidence = { ...dataEvidence, deliveryStatus: "unverified", reasonCode: str(delivery?.reasonCode || "dataset-delivery-unverified") };\n    }\n    await persist({ allocation, dataset: dataEvidence });\n  }\n  if (lifecycle.terminal === "completed" && !artifact && typeof adapter.collectArtifact === "function") {`,
  `let datasetDeliveryReason = "";`,
  "delivery proof before artifact import",
);
execution = replaceOrSkip(
  execution,
  `      const verified = typeof io.verifyArtifact === "function"\n        ? await safeCall(() => io.verifyArtifact(candidate, workSpec))\n        : null;`,
  `      const verified = deliveryVerified && typeof io.verifyArtifact === "function"\n        ? await safeCall(() => io.verifyArtifact(candidate, workSpec))\n        : null;`,
  `const verified = deliveryVerified && typeof io.verifyArtifact`,
  "artifact verifier delivery gate",
);
execution = replaceOrSkip(
  execution,
  `  await persist({ allocation, artifact, evaluation });`,
  `  await persist({ allocation, artifact, evaluation, dataset: dataEvidence });`,
  `artifact, evaluation, dataset: dataEvidence`,
  "pre-release data evidence persist",
);
execution = execution.replace(
  `  const computeBlock = await persist({ allocation, artifact, evaluation });`,
  `  const computeBlock = await persist({ allocation, artifact, evaluation, dataset: dataEvidence });`,
);
execution = replaceOrSkip(
  execution,
  `    artifactVerified: honesty.promotable,\n    canonicalEvaluationPending:`,
  `    datasetDelivered: deliveryVerified,\n    datasetDeliveryReason,\n    artifactVerified: honesty.promotable,\n    canonicalEvaluationPending:`,
  `datasetDelivered: deliveryVerified`,
  "data delivery summary",
);
execution = replaceOrSkip(
  execution,
  `        error: lifecycle.terminal === "completed" && honesty.promotable\n          ? "artifact verified but provider capacity release is not confirmed"\n          : lifecycle.terminal === "completed" ? honesty.reason : \`provider compute ${"${lifecycle.terminal || \"did not complete\"}"}\`,`,
  `        error: lifecycle.terminal === "completed" && !deliveryVerified\n          ? \`provider completed but governed dataset delivery is unproven: ${"${datasetDeliveryReason || \"no signed delivery receipt\"}"}\`\n          : lifecycle.terminal === "completed" && honesty.promotable\n            ? "artifact verified but provider capacity release is not confirmed"\n            : lifecycle.terminal === "completed" ? honesty.reason : \`provider compute ${"${lifecycle.terminal || \"did not complete\"}"}\`,`,
  `provider completed but governed dataset delivery is unproven`,
  "explicit delivery failure",
);

// Route hook: materialize bytes before authority compilation; issue a bearer
// grant after the sealed work-spec hash exists; verify previous authority with
// the same trusted manifest; pass URI only through ephemeral executor context.
execution = replaceOrSkip(
  execution,
  `  if (typeof io?.compileAuthority !== "function") {`,
  `  if (typeof io?.materializeDataset !== "function") {\n    return refusal(prior, "compute dataset materializer unavailable — remote execution requires server-owned corpus bytes", "dataset-materializer-unavailable");\n  }\n  const stagedDataset = await io.materializeDataset({ trainingRunId, request });\n  if (!stagedDataset?.ok || !stagedDataset.manifest) {\n    return refusal(prior, \`compute dataset materialization failed (${"${str(stagedDataset?.reasonCode) || \"unknown\"}"}): ${"${str(stagedDataset?.reason) || \"no detail\"}"}\`, str(stagedDataset?.reasonCode) || "dataset-materialization-failed");\n  }\n\n  if (typeof io?.compileAuthority !== "function") {`,
  `const stagedDataset = await io.materializeDataset`,
  "materialize before authority",
);
execution = replaceOrSkip(
  execution,
  `  const compiled = await io.compileAuthority({ trainingRunId, request });`,
  `  const compiled = await io.compileAuthority({ trainingRunId, request, datasetManifest: stagedDataset.manifest });`,
  `datasetManifest: stagedDataset.manifest`,
  "manifest-bound authority compile",
);
execution = replaceOrSkip(
  execution,
  `    const verdict = await io.verifyAuthority(prior.authority);`,
  `    const verdict = await io.verifyAuthority(prior.authority, stagedDataset.manifest);`,
  `io.verifyAuthority(prior.authority, stagedDataset.manifest)`,
  "manifest-bound prior authority verify",
);
execution = replaceOrSkip(
  execution,
  `  if (action === "resume") {`,
  `  if (action === "resume") {`,
  `if (action === "resume")`,
  "resume anchor retained",
);
execution = replaceOrSkip(
  execution,
  `  const outcome = await executeProviderComputeRun({`,
  `  if (typeof io?.issueDatasetAccess !== "function") {\n    return refusal(prior, "compute dataset grant issuer unavailable — remote provider cannot receive governed corpus bytes", "dataset-access-unavailable");\n  }\n  const grant = await io.issueDatasetAccess({\n    manifest: stagedDataset.manifest,\n    trainingRunId,\n    workSpecHash: authority.workSpecHash,\n    priorEvidence: prior?.dataset || null,\n  });\n  if (!grant?.ok || !grant.access || !grant.evidence) {\n    return refusal(prior, \`compute dataset access failed (${"${str(grant?.reasonCode) || \"unknown\"}"}): ${"${str(grant?.reason) || \"no detail\"}"}\`, str(grant?.reasonCode) || "dataset-access-failed");\n  }\n\n  const outcome = await executeProviderComputeRun({`,
  `const grant = await io.issueDatasetAccess`,
  "issue provider dataset grant",
);
execution = replaceOrSkip(
  execution,
  `    authority,\n    io,`,
  `    authority,\n    datasetAccess: grant.access,\n    datasetEvidence: { ...grant.evidence, manifestHash: stagedDataset.manifest.manifestHash, exportId: stagedDataset.manifest.exportId },\n    io,`,
  `datasetAccess: grant.access`,
  "pass ephemeral grant and safe evidence",
);
write(executionPath, execution);

// ---------------------------------------------------------------------------
// Route IO uses fresh workspace state and the server-only data plane.
// ---------------------------------------------------------------------------
const routePath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/app/api/workspace/sandbox-run/route.js";
let route = read(routePath);
route = replaceOrSkip(
  route,
  `import {\n  compileComputeAuthority,\n  verifyComputeAuthorityAgainstWorkspace\n} from "@/lib/compute-authority";`,
  `import {\n  compileComputeAuthority,\n  verifyComputeAuthorityAgainstWorkspace\n} from "@/lib/compute-authority";\nimport {\n  issueComputeDatasetAccess,\n  materializeComputeDataset,\n  verifyComputeDatasetDelivery\n} from "@/lib/compute-data-plane";`,
  `from "@/lib/compute-data-plane"`,
  "data-plane route imports",
);
route = replaceOrSkip(
  route,
  `          compileAuthority: async ({ trainingRunId, request, datasetManifest }) => compileComputeAuthority({`,
  `          materializeDataset: async ({ trainingRunId, request }) => materializeComputeDataset({\n            workspaceConfig: await readWorkspaceConfig(),\n            trainingRunId,\n            request,\n          }),\n          issueDatasetAccess: async ({ manifest, trainingRunId, workSpecHash }) => issueComputeDatasetAccess({\n            manifest,\n            trainingRunId,\n            workSpecHash,\n          }),\n          verifyDatasetDelivery: ({ evidence, workSpec }) => verifyComputeDatasetDelivery({ evidence, workSpec }),\n          compileAuthority: async ({ trainingRunId, request, datasetManifest }) => compileComputeAuthority({`,
  `materializeDataset: async ({ trainingRunId, request })`,
  "data-plane route IO",
);
route = replaceOrSkip(
  route,
  `          verifyAuthority: async (authority) => verifyComputeAuthorityAgainstWorkspace({`,
  `          verifyAuthority: async (authority, datasetManifest) => verifyComputeAuthorityAgainstWorkspace({`,
  `verifyAuthority: async (authority, datasetManifest)`,
  "authority verifier manifest parameter",
);
route = replaceOrSkip(
  route,
  `            datasetManifest: null,`,
  `            datasetManifest,`,
  `            datasetManifest,\n            now:`,
  "trusted manifest in authority verify",
);
write(routePath, route);

// ---------------------------------------------------------------------------
// Provider adapters receive the short-lived capability separately from the
// sealed work spec. It is never copied into receipt/event evidence.
// ---------------------------------------------------------------------------
const modalAdapterPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/compute/modal-compute.js";
let modalAdapter = read(modalAdapterPath);
modalAdapter = replaceOrSkip(
  modalAdapter,
  `        workSpec: ctx?.workSpec,\n        gpu:`,
  `        workSpec: ctx?.workSpec,\n        datasetAccess: ctx?.datasetAccess,\n        gpu:`,
  `datasetAccess: ctx?.datasetAccess`,
  "Modal dataset access payload",
);
write(modalAdapterPath, modalAdapter);

const runpodPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/compute/runpod-compute.js";
let runpod = read(runpodPath);
runpod = replaceOrSkip(
  runpod,
  `            workSpec: ctx?.workSpec,\n            growthub: {`,
  `            workSpec: ctx?.workSpec,\n            datasetAccess: ctx?.datasetAccess,\n            growthub: {`,
  `datasetAccess: ctx?.datasetAccess`,
  "Runpod serverless dataset access",
);
runpod = replaceOrSkip(
  runpod,
  `        GROWTHUB_WORK_SPEC_JSON: JSON.stringify(ctx?.workSpec || {}),`,
  `        GROWTHUB_WORK_SPEC_JSON: JSON.stringify(ctx?.workSpec || {}),\n        GROWTHUB_DATASET_ACCESS_JSON: JSON.stringify(ctx?.datasetAccess || {}),`,
  `GROWTHUB_DATASET_ACCESS_JSON`,
  "Runpod pod dataset access",
);
write(runpodPath, runpod);

const rayPath = "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/adapters/compute/ray-cluster-compute.js";
let ray = read(rayPath);
ray = replaceOrSkip(
  ray,
  `        GROWTHUB_WORK_SPEC_JSON: JSON.stringify(ctx?.workSpec || {}),`,
  `        GROWTHUB_WORK_SPEC_JSON: JSON.stringify(ctx?.workSpec || {}),\n        GROWTHUB_DATASET_ACCESS_JSON: JSON.stringify(ctx?.datasetAccess || {}),`,
  `GROWTHUB_DATASET_ACCESS_JSON`,
  "Ray dataset access",
);
write(rayPath, ray);

// ---------------------------------------------------------------------------
// Booted proof: fake provider must fetch and hash exact server bytes.
// ---------------------------------------------------------------------------
const e2ePath = "scripts/e2e-compute-route-realization-loop.mjs";
let e2e = read(e2ePath);
e2e = replaceOrSkip(
  e2e,
  `let cancelCount = 0;`,
  `let cancelCount = 0;\nlet datasetFetchCount = 0;`,
  `let datasetFetchCount = 0;`,
  "dataset fetch counter",
);
e2e = replaceOrSkip(
  e2e,
  `    assert.match(String(body.workSpec?.workSpecHash || ""), /^[0-9a-f]{64}$/);\n    assert.equal(body.workSpec?.output?.modelTag, "student-v1");\n    return json(200, { call_id: \`call-${"${body.workSpec.trainingRunId}"}\` });`,
  `    assert.match(String(body.workSpec?.workSpecHash || ""), /^[0-9a-f]{64}$/);\n    assert.equal(body.workSpec?.output?.modelTag, "student-v1");\n    assert.equal(body.datasetAccess?.workSpecHash, body.workSpec.workSpecHash);\n    const corpusResponse = await fetch(body.datasetAccess?.uri);\n    assert.equal(corpusResponse.ok, true, "provider can retrieve the signed governed corpus");\n    const corpusBytes = Buffer.from(await corpusResponse.arrayBuffer());\n    const corpusSha = crypto.createHash("sha256").update(corpusBytes).digest("hex");\n    assert.equal(corpusSha, body.datasetAccess.corpusSha256);\n    assert.equal(corpusBytes.byteLength, body.datasetAccess.sizeBytes);\n    datasetFetchCount += 1;\n    return json(200, { call_id: \`call-${"${body.workSpec.trainingRunId}"}\` });`,
  `datasetFetchCount += 1;`,
  "provider retrieves governed corpus",
);
e2e = replaceOrSkip(
  e2e,
  `  const runIds = ["route-crash", "route-resume", "route-cancel", "route-success"];\n  const runRows =`,
  `  const runIds = ["route-crash", "route-resume", "route-cancel", "route-success"];\n  const corpusRows = runIds.flatMap((trainingRunId) => Array.from({ length: 2 }, (_, exportOrdinal) => ({\n    inputPrompt: \`Training corpus ${"${trainingRunId}"} prompt ${"${exportOrdinal}"}\`,\n    agentOutput: \`Training corpus ${"${trainingRunId}"} answer ${"${exportOrdinal}"}\`,\n    qualityScore: 5,\n    redactionStatus: "clear",\n    exported: "true",\n    lastExportId: \`export-${"${trainingRunId}"}\`,\n    datasetExportId: \`export-${"${trainingRunId}"}\`,\n    exportOrdinal,\n    trainingExportIds: [\`export-${"${trainingRunId}"}\`],\n  })));\n  const tracesObject = objects.find((object) => object.id === "training-traces" || object.objectType === "training-traces");\n  if (tracesObject) tracesObject.rows = corpusRows;\n  else objects.push({ id: "training-traces", objectType: "training-traces", label: "Training Traces", columns: [], rows: corpusRows });\n\n  const runRows =`,
  `const corpusRows = runIds.flatMap`,
  "booted corpus rows",
);
e2e = replaceOrSkip(
  e2e,
  `lastExportSummary: JSON.stringify({ recordCount: 40, path:`,
  `lastExportSummary: JSON.stringify({ recordCount: 2, path:`,
  `recordCount: 2, path:`,
  "booted export count",
);
e2e = replaceOrSkip(
  e2e,
  `        GROWTHUB_COMPUTE_AUTHORITY_KEY: AUTHORITY_KEY,`,
  `        GROWTHUB_COMPUTE_AUTHORITY_KEY: AUTHORITY_KEY,\n        GROWTHUB_COMPUTE_PUBLIC_BASE_URL: base,\n        GROWTHUB_COMPUTE_DATA_ROOT: path.join(tmp, "compute-data"),`,
  `GROWTHUB_COMPUTE_PUBLIC_BASE_URL: base`,
  "booted data-plane environment",
);
e2e = replaceOrSkip(
  e2e,
  `  assert.equal(recoveredCompute.artifact.verifiedSha256, artifactSha);`,
  `  assert.equal(recoveredCompute.artifact.verifiedSha256, artifactSha);\n  assert.equal(recoveredCompute.dataset?.deliveryStatus, "delivered");\n  assert.match(String(recoveredCompute.dataset?.manifestHash || ""), /^[0-9a-f]{64}$/);\n  assert.equal(JSON.stringify(recoveredCompute.dataset).includes("/api/workspace/compute-data/"), false, "bearer corpus URL never enters receipt evidence");`,
  `recoveredCompute.dataset?.deliveryStatus`,
  "recovered delivery proof",
);
e2e = replaceOrSkip(
  e2e,
  `  assert.equal(successCompute.artifact.verifiedSha256, artifactSha);`,
  `  assert.equal(successCompute.artifact.verifiedSha256, artifactSha);\n  assert.equal(successCompute.dataset?.deliveryStatus, "delivered");\n  assert.equal(successCompute.dataset?.corpusSha256, successCompute.workSpec?.dataset?.corpusSha256);\n  assert.ok(datasetFetchCount >= 3, "remote providers fetched server-materialized corpus bytes before artifact import");`,
  `assert.ok(datasetFetchCount >= 3`,
  "success delivery proof",
);
write(e2ePath, e2e);

// Canonical-eval e2e must append holdouts rather than overwrite training rows.
const canonicalE2ePath = "scripts/apply-compute-canonical-e2e.mjs";
let canonicalE2e = read(canonicalE2ePath);
canonicalE2e = canonicalE2e.replace(
  `  if (existingTraces) existingTraces.rows = holdoutRows;`,
  `  if (existingTraces) existingTraces.rows = [...(existingTraces.rows || []), ...holdoutRows];`,
);
write(canonicalE2ePath, canonicalE2e);

// Permanent certification registration.
const certificationPath = "scripts/run-compute-certification.mjs";
let certification = read(certificationPath);
if (!certification.includes("scripts/unit-compute-data-plane.test.mjs")) {
  certification = replaceOnce(
    certification,
    `  "scripts/unit-compute-budget-policy.test.mjs",\n`,
    `  "scripts/unit-compute-budget-policy.test.mjs",\n  "scripts/unit-compute-data-plane.test.mjs",\n`,
    "data-plane certification suite",
  );
}
if (!certification.includes("scripts/unit-compute-outbound-policy.test.mjs")) {
  certification = replaceOnce(
    certification,
    `  "scripts/unit-compute-network-policy.test.mjs",\n`,
    `  "scripts/unit-compute-network-policy.test.mjs",\n  "scripts/unit-compute-outbound-policy.test.mjs",\n`,
    "registry outbound certification suite",
  );
}
write(certificationPath, certification);

console.log("[data-plane] export-tagged bytes, signed delivery, provider capability, and import gate wired end to end");
