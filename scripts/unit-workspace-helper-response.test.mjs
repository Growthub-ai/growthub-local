import assert from "node:assert/strict";
import test from "node:test";

import { buildWorkspaceHelperApplyResponse } from "../cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace/lib/workspace-helper-response.js";

const receipt = {
  type: "routine.environment.upsert",
  artifact: {
    environmentId: "routine-env-1",
    objectId: "chat-scheduling",
    rowName: "All Core 360",
    stage: "draft",
    draftSha256: "a".repeat(64),
  },
};

test("receipt mode omits the full workspace and conversation payload", () => {
  const response = buildWorkspaceHelperApplyResponse({
    responseMode: "receipt",
    threadId: null,
    applied: [receipt],
    skipped: [],
    workspaceConfig: { payload: "x".repeat(22_500_000) },
    messages: [{ content: "large conversation" }],
  });

  assert.deepEqual(response, {
    ok: true,
    threadId: null,
    applied: [receipt],
    skipped: [],
  });
  assert.ok(Buffer.byteLength(JSON.stringify(response), "utf8") < 4_500_000);
  assert.equal("workspaceConfig" in response, false);
  assert.equal("messages" in response, false);
});

test("the existing full response remains unchanged when receipt mode is absent", () => {
  const workspaceConfig = { version: "1" };
  const messages = [{ content: "applied" }];
  const response = buildWorkspaceHelperApplyResponse({
    responseMode: undefined,
    threadId: "thread-1",
    applied: [receipt],
    skipped: [],
    workspaceConfig,
    messages,
  });

  assert.deepEqual(response, {
    ok: true,
    threadId: "thread-1",
    applied: [receipt],
    skipped: [],
    workspaceConfig,
    messages,
  });
});
