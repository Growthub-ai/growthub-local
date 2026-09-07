import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = path.join(root, "cli/assets/worker-kits/growthub-custom-workspace-starter-v1/apps/workspace");

test("a config mutation excludes source history and preserves concurrently appended source records in Postgres", async (t) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "growthub-pg-config-"));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const seed = JSON.parse(await fs.readFile(path.join(app, "growthub.config.json"), "utf8"));
  await fs.writeFile(path.join(temporary, "growthub.config.json"), JSON.stringify(seed));
  const calls = [];
  const callbackKey = `__workspacePgTest_${Date.now()}`;
  globalThis[callbackKey] = async (sql, values) => {
    calls.push({ sql, values });
    if (sql.startsWith("select ")) return { rows: [{ config: structuredClone(seed) }] };
    return { rows: [] };
  };
  t.after(() => { delete globalThis[callbackKey]; });
  const fakePg = path.join(temporary, "pg.mjs");
  await fs.writeFile(fakePg, `export class Client {
    async connect() {} async end() {}
    query(sql, values) { return globalThis[${JSON.stringify(callbackKey)}](sql, values) }
  }`);
  const source = (await fs.readFile(path.join(app, "lib/workspace-config.js"), "utf8"))
    .replace('from "@/lib/adapters/env";', `from ${JSON.stringify(pathToFileURL(path.join(app, "lib/adapters/env.js")).href)};`)
    .replace('from "@/lib/workspace-schema";', `from ${JSON.stringify(pathToFileURL(path.join(app, "lib/workspace-schema.js")).href)};`)
    .replace('await import("pg")', `await import(${JSON.stringify(pathToFileURL(fakePg).href)})`);
  const modulePath = path.join(temporary, "config.mjs");
  await fs.writeFile(modulePath, source);
  const envKeys = ["GROWTHUB_WORKSPACE_DATA_ADAPTER", "DATABASE_URL", "GROWTHUB_WORKSPACE_USER_ID", "GROWTHUB_WORKSPACE_CONFIG_ID", "GROWTHUB_WORKSPACE_SESSION_PATH", "AGENCY_PORTAL_WORKSPACE_SESSION_PATH"];
  const previousEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  const cwd = process.cwd();
  try {
    process.chdir(temporary);
    process.env.GROWTHUB_WORKSPACE_DATA_ADAPTER = "postgres";
    process.env.DATABASE_URL = "postgres://fixture.invalid/fixture";
    process.env.GROWTHUB_WORKSPACE_USER_ID = "step-fixture-owner";
    process.env.GROWTHUB_WORKSPACE_CONFIG_ID = "step-fixture-workspace";
    delete process.env.GROWTHUB_WORKSPACE_SESSION_PATH;
    delete process.env.AGENCY_PORTAL_WORKSPACE_SESSION_PATH;
    const { writeWorkspaceConfig } = await import(pathToFileURL(modulePath).href);
    const next = await writeWorkspaceConfig({ canvas: { name: "Receipt publication fixture" } });
    assert.equal(next.canvas.name, "Receipt publication fixture");
  } finally {
    process.chdir(cwd);
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  }
  const read = calls.find(call => call.sql.startsWith("select "));
  assert.match(read.sql, /config - 'auxiliarySourceRecords'/);
  const write = calls.find(call => call.sql.includes("do update set"));
  assert.ok(write);
  assert.equal(JSON.parse(write.values[4]).auxiliarySourceRecords, undefined);
  assert.equal(write.values[5], true);

  // Execute the actual emitted upsert against PostgreSQL when the local QA
  // container is supplied. A temporary table shadows the product table and the
  // transaction is rolled back; no local customer row is read or changed.
  const container = process.env.GROWTHUB_TEST_POSTGRES_CONTAINER;
  if (!container) {
    t.diagnostic("PostgreSQL execution not requested; transport assertions passed.");
    return;
  }
  const literal = value => value === null ? "null" : typeof value === "boolean" ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
  const statement = write.sql.replace(/\$(\d+)/g, (_, index) => literal(write.values[Number(index) - 1]));
  const result = spawnSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], {
    encoding: "utf8",
    input: `begin;
create temporary table growthub_workspace_configs (owner_id text, workspace_id text, owner_email text, hosted_base_url text, config jsonb, updated_at timestamptz, primary key(owner_id, workspace_id));
insert into growthub_workspace_configs values ('step-fixture-owner','step-fixture-workspace',null,null,'{"name":"old","auxiliarySourceRecords":{"sandbox:run":{"records":[{"id":"first"}]}}}',now());
update growthub_workspace_configs set config = jsonb_set(config, '{auxiliarySourceRecords,sandbox:run,records}', '[{"id":"first"},{"id":"concurrent"}]');
${statement};
select jsonb_build_object('name',config #> '{canvas,name}','records',config #> '{auxiliarySourceRecords,sandbox:run,records}') from growthub_workspace_configs;
rollback;
`,
  });
  assert.equal(result.status, 0, result.stderr);
  const persisted = JSON.parse(result.stdout.split("\n").find(line => line.startsWith("{")));
  assert.equal(persisted.name, "Receipt publication fixture");
  assert.deepEqual(persisted.records, [{ id: "first" }, { id: "concurrent" }]);
});
