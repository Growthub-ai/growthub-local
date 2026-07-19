import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(
  repoRoot,
  "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace"
);

async function loadWorkspaceConfigModule(temporaryDirectory) {
  const modulePath = path.join(appRoot, "lib/workspace-config.js");
  const envModuleUrl = pathToFileURL(path.join(appRoot, "lib/adapters/env.js")).href;
  const schemaModuleUrl = pathToFileURL(path.join(appRoot, "lib/workspace-schema.js")).href;
  const source = (await fs.readFile(modulePath, "utf8"))
    .replace('from "@/lib/adapters/env";', `from ${JSON.stringify(envModuleUrl)};`)
    .replace('from "@/lib/workspace-schema";', `from ${JSON.stringify(schemaModuleUrl)};`);
  const testModulePath = path.join(temporaryDirectory, "workspace-config-under-test.mjs");
  await fs.writeFile(testModulePath, source, "utf8");
  return import(`${pathToFileURL(testModulePath).href}?case=concurrent-append`);
}

test("concurrent source-record appends are serialized without losing records", async (t) => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "growthub-source-append-"));
  t.after(() => fs.rm(temporaryDirectory, { recursive: true, force: true }));

  await fs.copyFile(
    path.join(appRoot, "growthub.config.json"),
    path.join(temporaryDirectory, "growthub.config.json")
  );

  const previousCwd = process.cwd();
  const previousAllowWrite = process.env.WORKSPACE_CONFIG_ALLOW_FS_WRITE;
  const previousDataAdapter = process.env.GROWTHUB_WORKSPACE_DATA_ADAPTER;
  process.chdir(temporaryDirectory);
  process.env.WORKSPACE_CONFIG_ALLOW_FS_WRITE = "true";
  process.env.GROWTHUB_WORKSPACE_DATA_ADAPTER = "provider-managed";

  try {
    const { appendWorkspaceSourceRecords, readWorkspaceSourceRecords } =
      await loadWorkspaceConfigModule(temporaryDirectory);
    const recordCount = 64;
    const sourceId = "model-invocation:policy:model";
    await Promise.all(
      Array.from({ length: recordCount }, (_, ordinal) =>
        appendWorkspaceSourceRecords(
          sourceId,
          [{ ordinal }],
          {
            integrationId: "policy",
            fetchedAt: new Date(Date.UTC(2026, 6, 19, 0, 0, ordinal)).toISOString(),
          },
          { maxRecords: recordCount }
        )
      )
    );

    const entry = await readWorkspaceSourceRecords(sourceId);
    assert.equal(entry.recordCount, recordCount);
    assert.deepEqual(
      entry.records.map((record) => record.ordinal),
      Array.from({ length: recordCount }, (_, ordinal) => ordinal)
    );
    assert.equal(entry.integrationId, "policy");

    const sidecar = JSON.parse(
      await fs.readFile(path.join(temporaryDirectory, "growthub.source-records.json"), "utf8")
    );
    assert.equal(sidecar[sourceId].recordCount, recordCount);
    assert.equal(sidecar[sourceId].records.at(-1).ordinal, recordCount - 1);

    const bounded = await appendWorkspaceSourceRecords(
      sourceId,
      [{ ordinal: recordCount }, { ordinal: recordCount + 1 }],
      { integrationId: "policy", fetchedAt: "2026-07-19T00:01:05.000Z" },
      { maxRecords: recordCount }
    );
    assert.equal(bounded.recordCount, recordCount);
    assert.deepEqual(
      bounded.records.map((record) => record.ordinal),
      Array.from({ length: recordCount }, (_, ordinal) => ordinal + 2)
    );
  } finally {
    process.chdir(previousCwd);
    if (previousAllowWrite === undefined) delete process.env.WORKSPACE_CONFIG_ALLOW_FS_WRITE;
    else process.env.WORKSPACE_CONFIG_ALLOW_FS_WRITE = previousAllowWrite;
    if (previousDataAdapter === undefined) delete process.env.GROWTHUB_WORKSPACE_DATA_ADAPTER;
    else process.env.GROWTHUB_WORKSPACE_DATA_ADAPTER = previousDataAdapter;
  }
});
