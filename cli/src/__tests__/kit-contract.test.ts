/**
 * Phase 3 + 4 sanity tests for the Pipeline Kit Contract v1 runtime
 * readers and the kit-contract CLI commands.
 *
 * These tests run against the real reference implementation
 * (growthub-creative-video-pipeline-v1) shipped in
 * `cli/assets/worker-kits/`. They confirm the readers parse the
 * shipped manifests onto the SDK shapes and that the JSON
 * projections agents will consume are stable.
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  PIPELINE_KIT_MANIFEST_VERSION,
  WORKSPACE_DEPENDENCY_MANIFEST_VERSION,
  KIT_HEALTH_REPORT_VERSION,
} from "@growthub/api-contract";
import {
  inspectPipelineManifest,
  readPipelineManifest,
} from "../runtime/pipeline-kits/index.js";
import {
  inspectWorkspaceDependencies,
  readWorkspaceDependencies,
} from "../runtime/workspace-dependencies/index.js";
import { computeKitHealthReport } from "../runtime/kit-health/index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../..");
const REFERENCE_KIT_ROOT = path.resolve(
  REPO_ROOT,
  "cli/assets/worker-kits/growthub-creative-video-pipeline-v1",
);
const SIMPLE_KIT_ROOT = path.resolve(
  REPO_ROOT,
  "cli/assets/worker-kits/growthub-marketing-skills-v1",
);

describe("pipeline-kits runtime reader", () => {
  it("parses the reference kit's pipeline.manifest.json onto the SDK shape", () => {
    expect(fs.existsSync(REFERENCE_KIT_ROOT)).toBe(true);
    const result = readPipelineManifest(REFERENCE_KIT_ROOT);
    expect(result.exists).toBe(true);
    expect(result.manifest).not.toBeNull();
    expect(result.manifest!.version).toBe(PIPELINE_KIT_MANIFEST_VERSION);
    expect(result.manifest!.kitId).toBe("growthub-creative-video-pipeline-v1");
    expect(result.manifest!.pipelineId).toBe("creative-video-pipeline");
    expect(result.manifest!.stages.map((s) => s.id)).toEqual([
      "brief-generation",
      "generative-execution",
      "video-edit",
    ]);
  });

  it("inspects the reference kit with status=pass and 3 stages", () => {
    const projection = inspectPipelineManifest(REFERENCE_KIT_ROOT);
    expect(projection.exists).toBe(true);
    expect(projection.status).toBe("pass");
    expect(projection.stageCount).toBe(3);
    const generative = projection.stages.find((s) => s.id === "generative-execution");
    expect(generative?.adapterModes).toEqual(["growthub-pipeline", "byo-api-key"]);
    expect(projection.outputTopology?.buckets).toEqual(["brief", "generative", "final"]);
  });

  it("returns exists=false for a kit without pipeline.manifest.json", () => {
    const projection = inspectPipelineManifest(SIMPLE_KIT_ROOT);
    expect(projection.exists).toBe(false);
    expect(projection.stageCount).toBe(0);
    expect(projection.status).toBe("pass");
  });
});

describe("workspace-dependencies runtime reader", () => {
  it("parses the reference kit's workspace.dependencies.json", () => {
    const result = readWorkspaceDependencies(REFERENCE_KIT_ROOT);
    expect(result.exists).toBe(true);
    expect(result.manifest).not.toBeNull();
    expect(result.manifest!.version).toBe(WORKSPACE_DEPENDENCY_MANIFEST_VERSION);
    expect(result.manifest!.dependencies.map((d) => d.id)).toEqual(["video-use"]);
    const videoUse = result.manifest!.dependencies[0];
    expect(videoUse.env).toBe("VIDEO_USE_HOME");
    expect(videoUse.kind).toBe("git-fork");
    expect(videoUse.usedByStages).toEqual(["video-edit"]);
  });

  it("inspects with status=pass when the manifest is valid", () => {
    const projection = inspectWorkspaceDependencies(REFERENCE_KIT_ROOT);
    expect(projection.status).toBe("pass");
    expect(projection.dependencyCount).toBe(1);
  });

  it("returns exists=false for a kit without external deps", () => {
    const projection = inspectWorkspaceDependencies(SIMPLE_KIT_ROOT);
    expect(projection.exists).toBe(false);
    expect(projection.dependencyCount).toBe(0);
  });
});

describe("kit-health runtime composer", () => {
  it("emits a KitHealthReport for the reference kit", () => {
    const report = computeKitHealthReport(REFERENCE_KIT_ROOT, { runLocalHelper: false });
    expect(report.version).toBe(KIT_HEALTH_REPORT_VERSION);
    expect(report.kitId).toBe("growthub-creative-video-pipeline-v1");
    // Convention envelope is set
    expect(report.convention?.spec).toBe("docs/PIPELINE_KIT_CONTRACT_V1.md");
    expect(report.convention?.runtimeEnforcement).toBe("none");
    // Pipeline manifest check should pass
    const pipelineCheck = report.checks.find((c) => c.id === "pipeline-manifest");
    expect(pipelineCheck?.severity).toBe("pass");
    // Workspace dependencies check should pass
    const depsCheck = report.checks.find((c) => c.id === "workspace-dependencies");
    expect(depsCheck?.severity).toBe("pass");
    // All sub-skills should resolve
    for (const stageId of ["brief-generation", "generative-execution", "video-edit"]) {
      const subSkillCheck = report.checks.find(
        (c) => c.id === `pipeline-stage-${stageId}-subskill`,
      );
      expect(subSkillCheck?.severity).toBe("pass");
    }
  });

  it("emits info-level (not fail) for a non-pipeline kit", () => {
    const report = computeKitHealthReport(SIMPLE_KIT_ROOT, { runLocalHelper: false });
    const pipelineCheck = report.checks.find((c) => c.id === "pipeline-manifest");
    expect(pipelineCheck?.severity).toBe("info");
    const depsCheck = report.checks.find((c) => c.id === "workspace-dependencies");
    expect(depsCheck?.severity).toBe("info");
  });

  it("never throws for a non-existent path", () => {
    const fake = path.resolve(REPO_ROOT, "this-does-not-exist-12345");
    const report = computeKitHealthReport(fake, { runLocalHelper: false });
    expect(report.overall).toBe("fail");
    const kitJsonCheck = report.checks.find((c) => c.id === "kit-json-missing");
    expect(kitJsonCheck?.severity).toBe("fail");
  });
});
