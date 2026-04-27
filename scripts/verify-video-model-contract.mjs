#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const ghAppRoot = path.resolve(
  process.env.GH_APP_HOME || path.join(repoRoot, "..", "gh-app"),
);
const hostedBaseUrl = (process.env.GROWTHUB_BASE_URL || "https://www.growthub.ai").replace(/\/+$/, "");

const registryPath = path.join(
  ghAppRoot,
  "packages/agents-sandbox/lib/tools/helpers/atlas-model-registry.ts",
);
const videoToolPath = path.join(
  ghAppRoot,
  "packages/agents-sandbox/lib/tools/video-generation.ts",
);
const freezeDocPath = path.join(
  ghAppRoot,
  "docs/protocol/S142-ATLAS-CLOUD-GENERATIVE-MEDIA-EXPANSION-FREEZE.md",
);
const migrationPath = path.join(
  ghAppRoot,
  "supabase/migrations/20260425224500_atlas_cloud_generative_media_models.sql",
);

function readRequired(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function parseTupleRows(source, constName) {
  const match = source.match(new RegExp(`const ${constName}:[\\s\\S]*?= \\[([\\s\\S]*?)\\];`));
  if (!match) throw new Error(`Could not find ${constName}`);
  return [...match[1].matchAll(
    /\[\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*(?:,\s*(true|false))?\s*\]/g,
  )].map((entry) => ({
    id: entry[1],
    label: entry[2],
    mode: entry[3],
    providerModel: entry[4],
    supportsAudio: entry[5] === "true",
  }));
}

function parseStableVideoModels(source) {
  const match = source.match(/const StableVideoModelSchema = z\.enum\(\[([\s\S]*?)\]\);/);
  if (!match) throw new Error("Could not find StableVideoModelSchema");
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

function validateVideoPayload(payload, stableIds, atlasVideoIds) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, error: "expected object" };
  }
  if (typeof payload.prompt !== "string" || payload.prompt.length === 0) {
    return { ok: false, error: "prompt required" };
  }
  if (!Object.prototype.hasOwnProperty.call(payload, "videoModel")) {
    return { ok: false, error: "videoModel required" };
  }
  const modelId = payload.videoModel;
  if (stableIds.includes(modelId) || atlasVideoIds.has(modelId)) {
    return {
      ok: true,
      modelId,
      provider: modelId.startsWith("sora-")
        ? "Sora"
        : modelId.startsWith("veo-")
          ? "Veo"
          : "Atlas",
    };
  }
  return { ok: false, error: "unsupported videoModel", modelId };
}

async function fetchHostedCapabilities() {
  const urls = [
    `${hostedBaseUrl}/api/cms/capabilities?family=video&include_experimental=true&include_disabled=true`,
    `${hostedBaseUrl}/api/cms/capabilities?slug=atlas&include_experimental=true&include_disabled=true`,
  ];
  const results = [];
  for (const url of urls) {
    const response = await fetch(url, { headers: { accept: "application/json" } });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 500) };
    }
    results.push({
      url,
      status: response.status,
      contractVersion: response.headers.get("x-growthub-api-contract-version"),
      capabilities: Array.isArray(body.capabilities)
        ? body.capabilities.map((capability) => ({
          slug: capability.slug,
          family: capability.family,
          experimental: capability.node?.experimental ?? null,
          toolName: capability.node?.executionTokens?.tool_name ?? null,
          inputKeys: Object.keys(capability.node?.executionTokens?.input_template || {}),
        }))
        : [],
      error: body.error,
    });
  }
  return results;
}

function summarizeBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = row[key] || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

async function main() {
  const registrySource = readRequired(registryPath);
  const videoToolSource = readRequired(videoToolPath);
  const freezeDocSource = fs.existsSync(freezeDocPath) ? fs.readFileSync(freezeDocPath, "utf8") : "";
  const migrationSource = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, "utf8") : "";

  const atlasVideoRows = parseTupleRows(registrySource, "ATLAS_VIDEO_MODEL_ROWS");
  const atlasImageRows = parseTupleRows(registrySource, "ATLAS_IMAGE_MODEL_ROWS");
  const stableVideoModelIds = parseStableVideoModels(videoToolSource);
  const atlasVideoIds = new Set(atlasVideoRows.map((row) => row.id));
  const uniqueSupportedVideoModelIds = [...new Set([
    ...stableVideoModelIds,
    ...atlasVideoRows.map((row) => row.id),
  ])];
  const overlap = stableVideoModelIds.filter((id) => atlasVideoIds.has(id));

  const validationCases = {
    camelAtlas: validateVideoPayload(
      { prompt: "proof", videoModel: "atlas-runway-gen4-turbo-i2v", creativeCount: 1 },
      stableVideoModelIds,
      atlasVideoIds,
    ),
    snakeAtlasOnly: validateVideoPayload(
      { prompt: "proof", video_model: "atlas-runway-gen4-turbo-i2v", creativeCount: 1 },
      stableVideoModelIds,
      atlasVideoIds,
    ),
    bothConflict: validateVideoPayload(
      {
        prompt: "proof",
        videoModel: "veo-3.1-fast-generate-001",
        video_model: "atlas-runway-gen4-turbo-i2v",
        creativeCount: 1,
      },
      stableVideoModelIds,
      atlasVideoIds,
    ),
    badCamel: validateVideoPayload(
      { prompt: "proof", videoModel: "atlas-not-real", creativeCount: 1 },
      stableVideoModelIds,
      atlasVideoIds,
    ),
  };

  const hosted = process.argv.includes("--hosted") ? await fetchHostedCapabilities() : undefined;
  const hostedAtlasVideo = hosted
    ?.flatMap((entry) => entry.capabilities)
    .find((capability) => capability.slug === "atlas-video-generation");
  const hostedVideoGeneration = hosted
    ?.flatMap((entry) => entry.capabilities)
    .find((capability) => capability.slug === "video-generation");

  const checks = [
    {
      id: "registry-video-count",
      ok: atlasVideoRows.length === 77,
      expected: 77,
      actual: atlasVideoRows.length,
    },
    {
      id: "registry-image-count",
      ok: atlasImageRows.length === 60,
      expected: 60,
      actual: atlasImageRows.length,
    },
    {
      id: "stable-video-model-key",
      ok: /videoModel:\s*z\.union/.test(videoToolSource),
      expected: "VideoGenerationInputSchema validates videoModel",
      actual: /videoModel:\s*z\.union/.test(videoToolSource),
    },
    {
      id: "snake-case-not-schema-key",
      ok: !/video_model/.test(videoToolSource),
      expected: "video_model absent from active tool schema",
      actual: /video_model/.test(videoToolSource) ? "present" : "absent",
    },
    {
      id: "snake-only-fails-proof",
      ok: validationCases.snakeAtlasOnly.ok === false,
      expected: "snake-only payload is not accepted by active schema",
      actual: validationCases.snakeAtlasOnly,
    },
    {
      id: "camel-atlas-passes-proof",
      ok: validationCases.camelAtlas.ok === true,
      expected: "camelCase Atlas model routes as Atlas",
      actual: validationCases.camelAtlas,
    },
    {
      id: "freeze-doc-counts",
      ok:
        /137 model entries/.test(freezeDocSource) &&
        /77 video entries/.test(freezeDocSource) &&
        /60 image entries/.test(freezeDocSource),
      expected: "freeze doc says 137 total, 77 video, 60 image",
      actual: {
        totalMentioned: /137 model entries/.test(freezeDocSource),
        videoMentioned: /77 video entries/.test(freezeDocSource),
        imageMentioned: /60 image entries/.test(freezeDocSource),
      },
    },
    {
      id: "migration-model-count",
      ok: /'model_count', 77/.test(migrationSource),
      expected: "atlas-video-generation migration declares model_count 77",
      actual: /'model_count', 77/.test(migrationSource),
    },
  ];

  if (hosted) {
    checks.push(
      {
        id: "hosted-atlas-video-discoverable",
        ok: Boolean(hostedAtlasVideo),
        expected: "hosted /api/cms/capabilities exposes atlas-video-generation with include_experimental=true",
        actual: hostedAtlasVideo ?? null,
      },
      {
        id: "hosted-default-video-generation-lacks-atlas-catalog",
        ok: Boolean(hostedVideoGeneration) && !hostedVideoGeneration.inputKeys.includes("provider"),
        expected: "default video-generation remains the single public node and does not expose Atlas catalog metadata",
        actual: hostedVideoGeneration ?? null,
      },
    );
  }

  const report = {
    generatedAt: new Date().toISOString(),
    paths: {
      growthubLocal: repoRoot,
      ghApp: ghAppRoot,
      registryPath,
      videoToolPath,
      freezeDocPath,
      migrationPath,
    },
    counts: {
      stableVideoModelIds: stableVideoModelIds.length,
      atlasVideoRows: atlasVideoRows.length,
      atlasImageRows: atlasImageRows.length,
      atlasGenerativeMediaRows: atlasVideoRows.length + atlasImageRows.length,
      overlapStableAndAtlasVideoIds: overlap.length,
      uniqueSupportedVideoModelIds: uniqueSupportedVideoModelIds.length,
      atlasOnlyVideoIds: atlasVideoRows.length - overlap.length,
    },
    distributions: {
      atlasVideoByMode: summarizeBy(atlasVideoRows, "mode"),
      atlasImageByMode: summarizeBy(atlasImageRows, "mode"),
      atlasVideoByFamily: atlasVideoRows.reduce((acc, row) => {
        const family = row.id.match(/^atlas-([a-z0-9]+)-/)?.[1] || row.id.split("-")[0];
        acc[family] = (acc[family] || 0) + 1;
        return acc;
      }, {}),
    },
    modelIds: {
      stableVideoModelIds,
      atlasVideoModelIds: atlasVideoRows.map((row) => row.id),
      uniqueSupportedVideoModelIds,
    },
    validationCases,
    hosted,
    checks,
    pass: checks.every((check) => check.ok),
    implementationStrategy: [
      "Keep growthub-local emitted execution JSON on inputs.videoModel.",
      "Expose Atlas choices from hosted capability manifest metadata, not from a handwritten local enum.",
      "Add a CLI/schema compatibility normalizer only at input boundaries: video_model -> videoModel when videoModel is absent; reject or warn on conflicts.",
      "Make experimental capability discovery explicit so atlas-video-generation can be inspected without replacing the public video-generation path.",
      "Add tests that assert 77 video rows, 60 image rows, camelCase acceptance, snake_case rejection/normalization, and hosted manifest discovery.",
    ],
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
