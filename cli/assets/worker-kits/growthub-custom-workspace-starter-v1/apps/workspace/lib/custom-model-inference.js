/**
 * Production custom-model inference over the governed mothership policy.
 *
 * This module performs no persistence and creates no mutation lane. The
 * orchestration runner calls it while executing an api-registry-call; the
 * sandbox-run route persists the returned invocation/trace evidence through
 * the existing source-record store.
 */

import { captureChatCompletion } from "./training-deployment.js";
import { normalizeDistillationTrace } from "./distillation-gateway.js";
import { deriveEndpointVerification } from "./training-verification.js";
import { readEnvVar } from "./server-secrets.js";

function registryRows(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  return objects
    .filter((object) => object?.objectType === "api-registry")
    .flatMap((object) => Array.isArray(object.rows) ? object.rows : [])
    .filter((row) => row && typeof row === "object");
}

function findRegistryRow(workspaceConfig, integrationId) {
  const wanted = String(integrationId || "").trim();
  return registryRows(workspaceConfig).find((row) => String(row?.integrationId || "").trim() === wanted) || null;
}

function promptFromInput(inputPayload) {
  const input = inputPayload && typeof inputPayload === "object" ? inputPayload : {};
  if (Array.isArray(input.messages)) {
    const last = [...input.messages].reverse().find((message) => String(message?.role || "") === "user");
    if (last) return String(last.content || "");
  }
  return String(input.prompt ?? input.text ?? input.instruction ?? "");
}

function responseContent(body) {
  return String(body?.choices?.[0]?.message?.content || "");
}

function isChatCompletion(body) {
  return Boolean(body && typeof body === "object" && Array.isArray(body.choices) && responseContent(body));
}

function routeRegistryRow(workspaceConfig, route) {
  const target = String(route?.target || "");
  if (target === "local-student") return findRegistryRow(workspaceConfig, route?.registryId);
  if (target === "local-base") {
    return {
      integrationId: `local-base:${String(route?.modelTag || "")}`,
      baseUrl: String(route?.baseUrl || "http://127.0.0.1:11434"),
      endpoint: String(route?.endpoint || "/v1/chat/completions"),
      expectedModelTag: String(route?.modelTag || ""),
      capabilities: "chat-completions",
    };
  }
  if (target === "teacher") {
    return {
      integrationId: `teacher:${String(route?.providerId || "custom")}`,
      baseUrl: String(route?.baseUrl || ""),
      endpoint: String(route?.endpoint || "/chat/completions"),
      expectedModelTag: String(route?.modelTag || ""),
      capabilities: "chat-completions",
    };
  }
  return null;
}

function availabilityForRoute({ workspaceConfig, policy, route }) {
  const target = String(route?.target || "");
  const row = routeRegistryRow(workspaceConfig, route);
  if (!row) return { available: false, row: null, reason: "governed API Registry target is missing" };
  if (!String(row.baseUrl || "").trim()) return { available: false, row, reason: "target endpoint is not configured" };
  if (!String(route?.modelTag || row?.expectedModelTag || "").trim()) {
    return { available: false, row, reason: "target model tag is missing" };
  }
  if (target === "local-student") {
    const verification = deriveEndpointVerification({
      registryRow: row,
      expectedTag: String(route?.modelTag || policy?.modelTag || ""),
      baseModel: String(policy?.fallbackBaseModel || ""),
    });
    if (!verification.verified) {
      return { available: false, row, reason: verification.reason || "student is not tuned-tag verified" };
    }
  }
  if (target === "teacher") {
    const authEnvVar = String(route?.authEnvVar || "").trim();
    const secret = authEnvVar ? readEnvVar(authEnvVar) : null;
    if (authEnvVar && !secret) return { available: false, row, reason: `teacher connection ${authEnvVar} is not configured` };
    return { available: true, row, authToken: secret?.value || "", reason: "" };
  }
  return { available: true, row, authToken: "", reason: "" };
}

/**
 * Execute a governed custom-model identity through its mothership routes.
 * Every attempt is a real HTTP request. A student response must report the
 * expected tuned tag; malformed or mismatched responses fall through to the
 * next governed route.
 */
export async function executeCustomModelInference({
  workspaceConfig,
  policyRow,
  inputPayload,
  fetchImpl,
  runId = "",
  clusterId = "workflow",
  maxTokens = 512,
  allowedTargets = null,
} = {}) {
  const policy = policyRow?.metadata?.mothershipProxy;
  const routes = Array.isArray(policy?.routes) ? policy.routes : [];
  if (!policy || routes.length === 0) {
    return { ok: false, error: "custom-model Registry row has no executable mothership policy", attempts: [] };
  }

  const prompt = promptFromInput(inputPayload);
  if (!prompt && !Array.isArray(inputPayload?.messages)) {
    return { ok: false, error: "custom-model inference requires a prompt or messages", attempts: [] };
  }

  const attempts = [];
  const targetAllow = Array.isArray(allowedTargets) && allowedTargets.length ? new Set(allowedTargets.map(String)) : null;
  for (const route of routes) {
    const target = String(route?.target || "");
    if (targetAllow && !targetAllow.has(target)) continue;
    const availability = availabilityForRoute({ workspaceConfig, policy, route });
    if (!availability.available) {
      attempts.push({ target, status: "skipped", reason: availability.reason });
      continue;
    }

    const expectedModel = String(route?.modelTag || availability.row?.expectedModelTag || "").trim();
    const result = await captureChatCompletion({
      registryRow: availability.row,
      modelTag: expectedModel,
      prompt,
      messages: inputPayload?.messages,
      maxTokens,
      fetchImpl,
      authToken: availability.authToken,
    });
    const body = result.response;
    const servedModel = String(body?.model || "").trim();
    const validBody = result.ok && isChatCompletion(body);
    const identityMatches = target !== "local-student" || servedModel === expectedModel;
    if (!validBody || !identityMatches) {
      attempts.push({
        target,
        status: "failed",
        httpStatus: Number(result.status) || 0,
        servedModel,
        reason: !result.ok
          ? String(result.error || `HTTP ${result.status || 0}`)
          : !validBody ? "upstream did not return an OpenAI chat completion"
            : `student served ${servedModel || "an unnamed model"}; expected ${expectedModel}`,
      });
      continue;
    }

    const usage = body?.usage && typeof body.usage === "object" ? body.usage : {};
    const completedAt = new Date().toISOString();
    const invocation = {
      schema: "growthub-custom-model-invocation-v1",
      runId: String(runId || ""),
      modelId: String(policy.workspaceSlug || "workspace-local"),
      policyRegistryId: String(policyRow?.integrationId || ""),
      route: target,
      providerId: String(route?.providerId || target),
      expectedModel,
      servedModel,
      status: Number(result.status) || 200,
      promptTokens: Math.max(0, Number(usage.prompt_tokens) || 0),
      completionTokens: Math.max(0, Number(usage.completion_tokens) || 0),
      completedAt,
      fallbackCount: attempts.filter((attempt) => attempt.status === "failed").length,
    };
    const trace = normalizeDistillationTrace({
      traceId: `trace_${String(runId || Date.now().toString(36))}_${target}`,
      capturedAt: completedAt,
      teacherModel: servedModel,
      teacherProviderId: String(route?.providerId || target),
      clusterId: String(inputPayload?.clusterId || clusterId || "workflow"),
      prompt,
      response: responseContent(body),
      reasoning: String(body?.choices?.[0]?.message?.reasoning || body?.reasoning || ""),
      promptTokens: invocation.promptTokens,
      completionTokens: invocation.completionTokens,
      score: 0,
    });
    attempts.push({ target, status: "completed", httpStatus: invocation.status, servedModel });
    return { ok: true, status: invocation.status, response: body, route, attempts, invocation, trace };
  }

  return {
    ok: false,
    error: attempts.length ? attempts[attempts.length - 1].reason : "no mothership route is configured",
    attempts,
  };
}

function numericScore(body) {
  const content = responseContent(body);
  try {
    const parsed = JSON.parse(content);
    const raw = Number(parsed.score ?? parsed.rating ?? parsed.winnerScore);
    if (Number.isFinite(raw)) return Math.max(0, Math.min(5, raw > 5 ? raw / 20 : raw));
  } catch {
    const match = content.match(/(?:score|rating)\s*[:=]\s*(\d+(?:\.\d+)?)/i);
    if (match) return Math.max(0, Math.min(5, Number(match[1]) > 5 ? Number(match[1]) / 20 : Number(match[1])));
  }
  return 0;
}

function combineExecutions(executions, response, extra = {}) {
  const successful = executions.filter((entry) => entry?.ok);
  return {
    ok: successful.length === executions.length,
    status: Number(response?.status) || 200,
    response: response?.response,
    route: response?.route,
    attempts: executions.flatMap((entry) => entry?.attempts || []),
    invocations: successful.map((entry) => entry.invocation).filter(Boolean),
    traces: successful.map((entry) => entry.trace).filter(Boolean),
    invocation: response?.invocation,
    trace: response?.trace,
    ...extra,
  };
}

/** Execute the shipped custom-model workflow variations as real model calls.
 * The canvas remains declarative; this server-side executor is the production
 * behavior behind those existing variants. */
export async function executeCustomModelWorkflow({
  workspaceConfig,
  policyRow,
  inputPayload,
  fetchImpl,
  runId = "",
  workflowVariant = "chat",
  maxTokens = 512,
} = {}) {
  const baseArgs = { workspaceConfig, policyRow, fetchImpl, runId, maxTokens };
  const prompt = promptFromInput(inputPayload);
  const call = (suffix, nextPrompt, options = {}) => executeCustomModelInference({
    ...baseArgs,
    runId: `${runId}${suffix ? `_${suffix}` : ""}`,
    inputPayload: { ...inputPayload, prompt: nextPrompt, messages: undefined },
    clusterId: workflowVariant,
    allowedTargets: options.allowedTargets,
  });

  if (workflowVariant === "chat") return call("", prompt);

  if (workflowVariant === "synthetic-scaling") {
    const generated = await call("synthetic", `${prompt}\n\nReturn one diverse training example as JSON with instruction, input, and output fields. Do not include secrets or personal data.`);
    if (!generated.ok) return generated;
    generated.trace = { ...generated.trace, synthetic: true, accepted: false, qualityStatus: "ungraded", redactionStatus: "pending" };
    generated.traces = [generated.trace];
    return generated;
  }

  if (workflowVariant === "recursive-learning") {
    const answer = await call("answer", prompt);
    if (!answer.ok) return answer;
    const answerText = responseContent(answer.response);
    const grade = await call("grade", `Score the following answer from 0 to 5 for correctness, usefulness, and safety. Return JSON only: {"score": number, "feedback": string}.\n\nTask: ${prompt}\n\nAnswer: ${answerText}`);
    if (!grade.ok) return grade;
    const score = numericScore(grade.response);
    const improved = await call("improve", `Improve the answer using this grader feedback. Return only the improved answer.\n\nTask: ${prompt}\n\nOriginal answer: ${answerText}\n\nFeedback: ${responseContent(grade.response)}`);
    if (!improved.ok) return improved;
    improved.trace = { ...improved.trace, score, recursiveLearning: true, accepted: score >= 4, qualityStatus: score >= 4 ? "qualified" : "needs-review" };
    return combineExecutions([answer, grade, improved], improved, { score, feedback: responseContent(grade.response) });
  }

  if (workflowVariant === "agentic") {
    const plan = await call("plan", `Create a concise multi-step plan for this goal. Identify assumptions and success criteria.\n\nGoal: ${prompt}`);
    if (!plan.ok) return plan;
    const critique = await call("critique", `Critique this plan for missing steps, unsafe assumptions, and verification gaps.\n\nGoal: ${prompt}\n\nPlan: ${responseContent(plan.response)}`);
    if (!critique.ok) return critique;
    const result = await call("result", `Produce the final answer for the goal using the plan and critique. State the completed result and remaining external dependencies honestly.\n\nGoal: ${prompt}\n\nPlan: ${responseContent(plan.response)}\n\nCritique: ${responseContent(critique.response)}`);
    if (!result.ok) return result;
    return combineExecutions([plan, critique, result], result, { agenticSteps: 3 });
  }

  if (workflowVariant === "eval-vs-base") {
    const tuned = await call("tuned", prompt, { allowedTargets: ["local-student"] });
    if (!tuned.ok) return { ...tuned, error: tuned.error || "the trained student is not available for evaluation" };
    const base = await call("base", prompt, { allowedTargets: ["local-base"] });
    if (!base.ok) return { ...base, error: base.error || "the governed base route is not available for evaluation" };
    const judgePrompt = `Evaluate two answers to the same holdout prompt. Return JSON only: {"winner":"tuned"|"base"|"tie","score":0-5,"reason":string}.\n\nPrompt: ${prompt}\n\nTuned answer: ${responseContent(tuned.response)}\n\nBase answer: ${responseContent(base.response)}`;
    const judge = await call("judge", judgePrompt, { allowedTargets: ["teacher"] });
    if (!judge.ok) return { ...judge, error: judge.error || "a configured teacher route is required to judge the holdout evaluation" };
    let verdict = { winner: "", score: numericScore(judge.response), reason: responseContent(judge.response) };
    try { verdict = { ...verdict, ...JSON.parse(responseContent(judge.response)) }; } catch { /* retain evidence text */ }
    const response = {
      id: `eval-${runId}`,
      object: "custom_model.evaluation",
      model: String(policyRow?.metadata?.mothershipProxy?.modelTag || ""),
      tuned: tuned.response,
      base: base.response,
      judge: judge.response,
      verdict,
    };
    return combineExecutions([tuned, base, judge], { ...judge, response }, { evaluation: { prompt, verdict, tunedModel: tuned.invocation?.servedModel, baseModel: base.invocation?.servedModel } });
  }

  return { ok: false, error: `unsupported custom-model workflow variant "${workflowVariant}"`, attempts: [] };
}

export { findRegistryRow };
