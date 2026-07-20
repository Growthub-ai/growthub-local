/**
 * Deterministic Compute Resolver — Sprint 4 of the Governed Compute
 * Realization. Pure: no React, no fetch, no fs, no clock (the caller injects
 * `now`). Equivalent inputs ALWAYS produce equivalent selection.
 *
 * The resolver answers exactly one question: given the derived requirements,
 * the derived provider states, each provider's declared capabilities, and
 * each provider's observed quote — WHERE may this workload execute?
 *
 * Two phases, never interleaved:
 *
 *   1. HARD ELIGIBILITY — every gate is fail-closed and every failure is a
 *      machine-readable reason code. Unknown is never treated as pass: an
 *      unproven region under a residency requirement fails; an unknown price
 *      under a hard budget fails (unless policy explicitly permits unknown
 *      cost); an expired quote is not evidence.
 *
 *   2. DETERMINISTIC RANKING of the survivors, by the governed order:
 *        explicit policy pin → local ownership → data locality → proven
 *        availability → warm/reserved capacity → queue latency → cost →
 *        checkpoint/resume capability → stable provider id.
 *      The final tiebreak is the lexicographic provider id, so no
 *      nondeterminism can hide in sort stability.
 *
 * Every candidate NOT selected carries its verdict (reasonCodes + human
 * reasons + rank), so a skipped provider is always explainable. The decision
 * is a `ComputeDecision` (contract schema growthub-compute-decision-v1)
 * persisted INSIDE the existing model-training-run receipt — never a
 * separate decision store.
 */

export const COMPUTE_DECISION_SCHEMA = "growthub-compute-decision-v1";

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeBudget(budget) {
  const b = budget && typeof budget === "object" ? budget : {};
  const mode = ["hard-cap", "advisory", "unlimited"].includes(b.mode) ? b.mode : "advisory";
  return {
    mode,
    maxTotalUsd: Math.max(0, num(b.maxTotalUsd)),
    maxHourlyUsd: Math.max(0, num(b.maxHourlyUsd)),
    allowUnknownCost: b.allowUnknownCost === true,
  };
}

/** Hourly cost of a quote in USD, or null when unknowable. */
function hourlyUsd(quote) {
  const basis = quote?.costBasis;
  if (!basis || typeof basis !== "object") return null;
  if (basis.kind === "owned-hardware") return 0;
  if (basis.kind === "per-hour") return num(basis.unitUsd, NaN) >= 0 && Number.isFinite(Number(basis.unitUsd)) ? num(basis.unitUsd) : null;
  if (basis.kind === "per-second") return Number.isFinite(Number(basis.unitUsd)) ? num(basis.unitUsd) * 3600 : null;
  return null; // per-job / unknown have no hourly shape
}

/** Total estimated cost of a quote in USD, or null when unknown. */
function totalUsd(quote) {
  if (quote?.costBasis?.kind === "owned-hardware") return 0;
  const v = quote?.estimatedTotalUsd;
  return v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Math.max(0, Number(v));
}

/**
 * Run the hard eligibility gates for one candidate. Pure. Returns
 * { eligible, reasonCodes[], reasons[] } — every failure named, all gates
 * evaluated (no short-circuit) so the operator sees the FULL repair list.
 */
export function evaluateCandidateEligibility({ requirements, capacityProfileId, provider, capabilities, quote, budget, policy, now }) {
  const req = requirements && typeof requirements === "object" ? requirements : {};
  const caps = capabilities && typeof capabilities === "object" ? capabilities : null;
  const reasonCodes = [];
  const reasons = [];
  const flag = (code, reason) => { reasonCodes.push(code); reasons.push(reason); };
  const portablePolicy = policy && typeof policy === "object" ? policy : {};
  const providerId = String(provider?.providerId || "");
  const availability = String(quote?.availabilityMode || "");
  if ((portablePolicy.excludeLocal === true || portablePolicy.mode === "cloud") && providerId === "local-machine") flag("local-excluded-by-policy", "customer policy requires cloud compute");
  if ((portablePolicy.localOnly === true || portablePolicy.mode === "local") && providerId !== "local-machine") flag("remote-excluded-by-policy", "customer policy requires this machine");
  if ((portablePolicy.reservedOnly === true || portablePolicy.mode === "reserved-cluster") && !["reserved", "warm"].includes(availability)) flag("reserved-capacity-required", "customer policy requires reserved cluster capacity");
  if (portablePolicy.allowPreemptible !== true && availability === "spot") flag("preemptible-excluded-by-policy", "customer policy does not permit preemptible capacity");

  // -- provider configuration state (from the governed registry derivation)
  const status = String(provider?.status || "");
  if (status === "invalid-row") flag("provider-invalid", `provider row invalid: ${provider?.statusReason || "validation failed"}`);
  else if (status === "adapter-missing") flag("adapter-missing", provider?.statusReason || "no registered adapter");
  else if (status === "credential-missing") flag("credential-missing", provider?.statusReason || "required credential absent");
  else if (status !== "ready") flag("provider-not-ready", `provider status "${status || "unknown"}"`);

  // -- profile support
  const profileId = String(capacityProfileId || "");
  const profiles = Array.isArray(provider?.capacityProfiles) ? provider.capacityProfiles : [];
  if (profileId && !profiles.includes(profileId)) {
    flag("profile-unsupported", `provider does not declare capacity profile "${profileId}"`);
  }

  // -- capability floors (unknown capability under a floor fails closed)
  if (!caps) {
    flag("capabilities-unavailable", "adapter capabilities not derivable");
  } else {
    if (num(req.gpuCount) > 0) {
      if (num(caps.maxGpusPerWorker) > 0 && num(req.gpuCount) > num(caps.maxGpusPerWorker)) {
        flag("gpu-count-unsupported", `needs ${req.gpuCount} GPUs/worker — provider offers at most ${caps.maxGpusPerWorker}`);
      }
      if (num(caps.maxGpusPerWorker) === 0) flag("no-gpu-capacity", "an accelerator is required and the provider offers none");
      if (num(req.minVramPerGpuGB) > 0) {
        if (num(caps.maxVramPerGpuGB) === 0) flag("vram-unproven", `needs ${req.minVramPerGpuGB} GB VRAM/GPU — provider VRAM not proven`);
        else if (num(caps.maxVramPerGpuGB) < num(req.minVramPerGpuGB)) flag("insufficient-vram", `needs ${req.minVramPerGpuGB} GB VRAM/GPU — provider offers ${caps.maxVramPerGpuGB} GB`);
      }
      const reqClass = String(req.acceleratorClass || "");
      const classes = Array.isArray(caps.acceleratorClasses) ? caps.acceleratorClasses : [];
      if (reqClass && reqClass !== "none" && reqClass !== "any-gpu" && classes.length > 0 && !classes.includes(reqClass) && !classes.includes("high-memory-gpu")) {
        flag("accelerator-class-unsupported", `needs ${reqClass} — provider declares ${classes.join("/") || "none"}`);
      }
    }
    if (num(req.minRamGB) > 0 && num(caps.maxRamGB) > 0 && num(caps.maxRamGB) < num(req.minRamGB)) {
      flag("insufficient-memory", `needs ${req.minRamGB} GB memory — provider offers ${caps.maxRamGB} GB`);
    }
    if (num(req.minDiskGB) > 0 && num(caps.maxDiskGB) > 0 && num(caps.maxDiskGB) < num(req.minDiskGB)) {
      flag("insufficient-storage", `needs ${req.minDiskGB} GB storage — provider offers ${caps.maxDiskGB} GB`);
    }
    if (req.checkpointRequired === true && caps.supportsCheckpointing !== true) {
      flag("checkpoint-unsupported", "run requires checkpointing — provider does not support it");
    }
    const dist = req.distributed && typeof req.distributed === "object" ? req.distributed : null;
    if (dist && num(dist.workers) >= 2) {
      if (num(caps.maxWorkers) < num(dist.workers)) {
        flag("distributed-unsupported", `needs ${dist.workers} workers — provider supports ${num(caps.maxWorkers) || 1}`);
      }
      if (dist.gangScheduling === true && caps.supportsGangScheduling !== true) {
        flag("gang-scheduling-unsupported", "distributed plan requires gang scheduling — provider cannot prove it");
      }
    }

    // -- region / data residency (fail closed on unproven)
    const wantRegions = Array.isArray(req.locality?.regions) ? req.locality.regions.filter(Boolean) : [];
    const haveRegions = Array.isArray(caps.regions) ? caps.regions.filter(Boolean) : [];
    if (wantRegions.length > 0) {
      if (haveRegions.length === 0) flag("region-unproven", `run is pinned to ${wantRegions.join("/")} — provider regions unknown`);
      else if (!wantRegions.some((r) => haveRegions.includes(r))) flag("region-unavailable", `run is pinned to ${wantRegions.join("/")} — provider offers ${haveRegions.join("/")}`);
    }
    const residency = String(req.locality?.dataResidency || "");
    if (residency) {
      const declared = String(provider?.config?.dataResidency || "");
      if (!declared) flag("data-residency-unproven", `data residency "${residency}" required — provider declares none`);
      else if (declared !== residency) flag("data-residency-mismatch", `data residency "${residency}" required — provider declares "${declared}"`);
    }
  }

  // -- duration
  const wantMinutes = num(req.estimatedDurationMinutes);
  const maxMinutes = num(provider?.config?.maxDurationMinutes);
  if (wantMinutes > 0 && maxMinutes > 0 && wantMinutes > maxMinutes) {
    flag("duration-unsupported", `run expects ~${wantMinutes} min — provider caps executions at ${maxMinutes} min`);
  }

  // -- quote freshness (an expired quote is not evidence)
  const nowMs = Number.isFinite(Number(now)) ? Number(now) : Date.parse(String(now || "")) || 0;
  if (quote) {
    const expires = Date.parse(String(quote.quoteExpiresAt || ""));
    if (Number.isFinite(expires) && nowMs > 0 && nowMs > expires) {
      flag("quote-expired", `quote expired at ${quote.quoteExpiresAt} — re-observe before deciding`);
    }
    if (quote.available === false) {
      flag("capacity-unavailable", "provider reports it cannot satisfy the requirements right now");
    }
  } else {
    flag("quote-missing", "no capacity observation for this provider");
  }

  // -- budget (unknown cost is NEVER zero)
  const b = normalizeBudget(budget);
  if (b.mode === "hard-cap" && quote) {
    const total = totalUsd(quote);
    const hourly = hourlyUsd(quote);
    if (total === null && !b.allowUnknownCost) {
      flag("cost-unknown-under-hard-budget", "estimated cost is unknown and the budget is a hard cap — unknown cost is ineligible unless policy explicitly permits it");
    }
    if (total !== null && b.maxTotalUsd > 0 && total > b.maxTotalUsd) {
      flag("over-budget", `estimated $${total.toFixed(2)} exceeds the $${b.maxTotalUsd.toFixed(2)} cap`);
    }
    if (b.maxHourlyUsd > 0) {
      if (hourly === null && !b.allowUnknownCost) flag("hourly-cost-unknown-under-hard-budget", "hourly cost unknown under a hard hourly cap");
      else if (hourly !== null && hourly > b.maxHourlyUsd) flag("over-hourly-budget", `$${hourly.toFixed(2)}/h exceeds the $${b.maxHourlyUsd.toFixed(2)}/h cap`);
    }
  }

  return { eligible: reasonCodes.length === 0, reasonCodes, reasons };
}

// ---------------------------------------------------------------------------
// Deterministic ranking
// ---------------------------------------------------------------------------

const AVAILABILITY_RANK = { local: 0, reserved: 1, warm: 1, "on-demand": 2, queued: 3, spot: 3 };

/**
 * Build the deterministic rank tuple for an ELIGIBLE candidate. Lower is
 * better at every position. The tuple order IS the governed ranking policy:
 *   [ policyPin, localOwnership, dataLocality, provenAvailability,
 *     warmCapacity, queueLatency, cost, checkpointResume, providerId ]
 */
export function rankTuple({ provider, capabilities, quote, requirements, pinnedProviderId }) {
  const providerId = String(provider?.providerId || "");
  const availability = String(quote?.availabilityMode || "");
  const wantRegions = Array.isArray(requirements?.locality?.regions) ? requirements.locality.regions.filter(Boolean) : [];
  const haveRegions = Array.isArray(capabilities?.regions) ? capabilities.regions.filter(Boolean) : [];
  const localityMatch = wantRegions.length === 0 ? 1 : (wantRegions.some((r) => haveRegions.includes(r)) ? 0 : 2);
  const total = totalUsd(quote);
  return [
    pinnedProviderId && providerId === pinnedProviderId ? 0 : 1,          // explicit policy
    availability === "local" ? 0 : 1,                                     // local ownership
    localityMatch,                                                        // data locality
    quote?.available === true ? 0 : 1,                                    // proven availability
    AVAILABILITY_RANK[availability] ?? 4,                                 // warm/reserved over burst/queue
    Math.max(0, num(quote?.queueLatencySeconds)),                         // queue latency
    total === null ? Number.MAX_SAFE_INTEGER : total,                     // cost (unknown ranks last)
    (capabilities?.supportsCheckpointing === true ? 0 : 1) + (capabilities?.supportsResume === true ? 0 : 1), // checkpoint/resume
    providerId,                                                           // stable id tiebreak
  ];
}

function compareTuples(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const av = a[i];
    const bv = b[i];
    if (av === bv) continue;
    if (typeof av === "string" || typeof bv === "string") return String(av) < String(bv) ? -1 : 1;
    return av < bv ? -1 : 1;
  }
  return 0;
}

/** Human labels for why the winner won (derived from its tuple context). */
function selectionReasons({ provider, quote, capabilities, pinnedProviderId }) {
  const reasons = [];
  const providerId = String(provider?.providerId || "");
  if (pinnedProviderId && providerId === pinnedProviderId) reasons.push("explicitly selected by policy");
  if (String(quote?.availabilityMode) === "local") reasons.push("locally owned hardware — zero marginal cost");
  if (quote?.available === true) reasons.push("capacity availability proven by observation");
  if (["warm", "reserved"].includes(String(quote?.availabilityMode))) reasons.push(`${quote.availabilityMode} capacity — low start latency`);
  const total = totalUsd(quote);
  if (total !== null) reasons.push(total === 0 ? "no cost accrues" : `estimated $${total.toFixed(2)} total`);
  if (capabilities?.supportsCheckpointing === true && capabilities?.supportsResume === true) reasons.push("supports checkpoint + resume");
  return reasons.length ? reasons : ["only eligible candidate"];
}

/**
 * Resolve WHERE the workload may execute. Pure and deterministic.
 *
 * @param {object} opts
 * @param {object}   opts.requirements       ComputeRequirements
 * @param {string}   opts.capacityProfileId
 * @param {object[]} opts.providers          deriveComputeProviders().providers
 * @param {object}   [opts.capabilitiesById] providerId -> ComputeProviderCapabilities
 * @param {object}   [opts.quotesById]       providerId -> ComputeProviderQuote
 * @param {object}   [opts.budget]           ComputeBudgetPolicy
 * @param {string}   [opts.selectionMode]    "auto" | "explicit"
 * @param {string}   [opts.pinnedProviderId] required when selectionMode="explicit"
 * @param {string|number} [opts.now]         ISO string or epoch ms (quote expiry)
 * @returns ComputeDecision
 */
export function resolveCompute({
  requirements = null,
  capacityProfileId = "",
  providers = [],
  capabilitiesById = {},
  quotesById = {},
  budget = null,
  policy = null,
  selectionMode = "auto",
  pinnedProviderId = "",
  now = "",
} = {}) {
  const mode = selectionMode === "explicit" ? "explicit" : "auto";
  const pin = mode === "explicit" ? String(pinnedProviderId || "") : "";
  const nowIso = (() => {
    const ms = Number.isFinite(Number(now)) && Number(now) > 0 ? Number(now) : Date.parse(String(now || ""));
    return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : "";
  })();

  const list = (Array.isArray(providers) ? providers : [])
    .filter((p) => p && typeof p === "object")
    // Deterministic input order regardless of caller ordering.
    .slice()
    .sort((a, b) => (String(a.providerId) < String(b.providerId) ? -1 : 1));

  const verdicts = [];
  const eligible = [];
  for (const provider of list) {
    const providerId = String(provider.providerId || "");
    const capabilities = capabilitiesById?.[providerId] || null;
    const quote = quotesById?.[providerId] || null;
    const gate = evaluateCandidateEligibility({ requirements, capacityProfileId, provider, capabilities, quote, budget, policy, now });
    // Under explicit mode, non-pinned providers are skipped BY POLICY, with
    // the reason named (they are not "ineligible" — they were not asked).
    if (pin && providerId !== pin) {
      verdicts.push({ providerId, eligible: false, reasonCodes: ["not-selected-by-policy"], reasons: [`selection mode is explicit — policy pins "${pin}"`], rank: -1, quote });
      continue;
    }
    if (!gate.eligible) {
      verdicts.push({ providerId, eligible: false, reasonCodes: gate.reasonCodes, reasons: gate.reasons, rank: -1, quote });
      continue;
    }
    eligible.push({ provider, capabilities, quote, providerId });
  }

  const ranked = eligible
    .map((c) => ({ ...c, tuple: rankTuple({ provider: c.provider, capabilities: c.capabilities, quote: c.quote, requirements, pinnedProviderId: pin }) }))
    .sort((a, b) => compareTuples(a.tuple, b.tuple));

  ranked.forEach((c, index) => {
    verdicts.push({ providerId: c.providerId, eligible: true, reasonCodes: index === 0 ? [] : ["outranked"], reasons: index === 0 ? [] : [`ranked #${index + 1} behind ${ranked[0].providerId}`], rank: index, quote: c.quote });
  });

  const winner = ranked[0] || null;
  return {
    schema: COMPUTE_DECISION_SCHEMA,
    capacityProfileId: String(capacityProfileId || ""),
    requirements: requirements && typeof requirements === "object" ? requirements : null,
    budget: normalizeBudget(budget),
    policy: policy && typeof policy === "object" ? policy : null,
    selectionMode: mode,
    selectedProviderId: winner ? winner.providerId : "",
    selectedReasons: winner ? selectionReasons({ provider: winner.provider, quote: winner.quote, capabilities: winner.capabilities, pinnedProviderId: pin }) : [],
    candidates: verdicts.sort((a, b) => (a.providerId < b.providerId ? -1 : 1)),
    decidedAt: nowIso,
    evidenceObservedAt: nowIso,
  };
}
