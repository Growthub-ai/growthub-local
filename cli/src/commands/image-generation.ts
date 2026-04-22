/**
 * CLI Command — image-generation
 *
 * Generates a branded image via the hosted image-generation node using
 * the CMS SDK v1 execution contract and the nano-banana-2 model.
 *
 * Usage:
 *   growthub image-generation
 *   growthub image-generation generate
 *   growthub image-generation generate --prompt "..." --model nano-banana-2
 */

import * as p from "@clack/prompts";
import pc from "picocolors";
import { Command } from "commander";
import type { CapabilityFamily } from "@growthub/api-contract/capabilities";
import type { ExecutionMode } from "@growthub/api-contract/execution";
import type { NodeInputProviderNeutralIntent } from "@growthub/api-contract/schemas";
import {
  createPipelineBuilder,
} from "../runtime/dynamic-registry-pipeline/index.js";
import {
  createHostedExecutionClient,
} from "../runtime/hosted-execution-client/index.js";
import {
  createArtifactStore,
} from "../runtime/artifact-contracts/index.js";
import { readSession, isSessionExpired } from "../auth/session-store.js";
import { printPaperclipCliBanner } from "../utils/banner.js";

// ---------------------------------------------------------------------------
// Constants — CMS SDK v1 image-generation node contract
// ---------------------------------------------------------------------------

const IMAGE_GENERATION_SLUG = "image-generation";

const IMAGE_FAMILY: CapabilityFamily = "image";
const EXECUTION_MODE: ExecutionMode = "hosted";

// Default model per user request: nano-banana-2
const DEFAULT_MODEL = "nano-banana-2";

// Branded showcase prompt — under 25 words, show-don't-tell
const DEFAULT_PROMPT =
  "Growthub workflow: glowing pipeline nodes connecting image, video, and text icons. Branded blue. Clean minimal tech illustration.";

// Reference image: Growthub logo
const REFERENCE_IMAGE_PATH = "ui/public/growthub logo copy.png";

// Input field intents used (CMS SDK v1 schema contract)
const _PROMPT_INTENT: NodeInputProviderNeutralIntent = "prompt";
const _MODEL_INTENT: NodeInputProviderNeutralIntent = "model";
const _REF_IMAGE_INTENT: NodeInputProviderNeutralIntent = "reference-image";

// ---------------------------------------------------------------------------
// Core generation function
// ---------------------------------------------------------------------------

interface ImageGenerationInput {
  prompt: string;
  model: string;
  referenceImage: string;
  saveWorkflow: boolean;
}

async function runImageGeneration(input: ImageGenerationInput): Promise<void> {
  const session = readSession();
  if (!session || isSessionExpired(session)) {
    p.log.error("No active hosted session. Run `growthub auth login` to authenticate.");
    process.exitCode = 1;
    return;
  }

  // Assemble the pipeline using CMS SDK v1 execution contract
  const builder = createPipelineBuilder({ executionMode: EXECUTION_MODE });

  const bindings: Record<string, unknown> = {
    prompt: input.prompt,
    model: input.model,
    reference_image: input.referenceImage,
    family: IMAGE_FAMILY,
  };

  const nodeId = builder.addNode(IMAGE_GENERATION_SLUG, bindings);
  const pipeline = builder.build();

  p.log.info(
    `Pipeline ${pc.dim(pipeline.pipelineId)} — node ${pc.bold(IMAGE_GENERATION_SLUG)} (${pc.dim(nodeId)})`,
  );
  p.log.info(`Model: ${pc.bold(input.model)}`);
  p.log.info(`Prompt: ${pc.dim(input.prompt)}`);
  p.log.info(`Reference image: ${pc.dim(input.referenceImage)}`);

  const execSpinner = p.spinner();
  execSpinner.start("Executing image generation via hosted runtime...");

  try {
    const executionClient = createHostedExecutionClient();

    const result = await executionClient.executeWorkflow({
      pipelineId: pipeline.pipelineId,
      threadId: pipeline.threadId,
      nodes: pipeline.nodes.map((n) => ({
        nodeId: n.id,
        slug: n.slug,
        bindings: n.bindings,
        upstreamNodeIds: n.upstreamNodeIds,
      })),
      executionMode: pipeline.executionMode,
      metadata: {
        workflowName: `image-generation-${input.model}`,
        description: "Branded image generation via CMS SDK v1",
        model: input.model,
        family: IMAGE_FAMILY,
      },
    });

    const succeeded = result.status === "succeeded";
    execSpinner.stop(
      succeeded
        ? pc.green(`Image generation succeeded (${result.executionId})`)
        : pc.red(`Image generation ${result.status} (${result.executionId})`),
    );

    // Display node results
    for (const [, nodeResult] of Object.entries(result.nodeResults)) {
      const color = nodeResult.status === "succeeded" ? pc.green : pc.red;
      p.log.info(`  ${color(nodeResult.status)} ${pc.bold(nodeResult.slug)}`);
      if (nodeResult.error) {
        p.log.error(`  ${nodeResult.error}`);
      }
    }

    // Display artifacts
    if (result.artifacts.length > 0) {
      console.log("");
      console.log(pc.bold("Generated artifacts:"));
      for (const art of result.artifacts) {
        console.log(`  ${pc.dim("·")} ${art.artifactType} — ${art.artifactId}`);
        if (art.metadata?.url) {
          console.log(`    ${pc.cyan(String(art.metadata.url))}`);
        }
      }
    }

    // Display execution summary
    if (result.summary) {
      console.log("");
      if (result.summary.outputText) {
        console.log(`  ${pc.dim("output:")} ${result.summary.outputText}`);
      }
      if (typeof result.summary.imageCount === "number") {
        console.log(`  ${pc.dim("images:")} ${result.summary.imageCount}`);
      }
    }

    // Store artifacts locally
    const artifactStore = createArtifactStore();
    for (const artRef of result.artifacts) {
      const nodeResult = result.nodeResults[artRef.nodeId];
      artifactStore.create({
        artifactType: artRef.artifactType as "image",
        sourceNodeSlug: nodeResult?.slug ?? IMAGE_GENERATION_SLUG,
        executionContext: "hosted",
        pipelineId: pipeline.pipelineId,
        nodeId: artRef.nodeId,
        threadId: result.threadId ?? pipeline.threadId,
        metadata: artRef.metadata ?? {},
      });
    }

    if (result.artifacts.length > 0) {
      p.log.info(`${result.artifacts.length} artifact(s) stored locally.`);
    }

    if (!succeeded) {
      process.exitCode = 1;
    }
  } catch (err) {
    execSpinner.stop(pc.red("Execution failed."));
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Interactive hub
// ---------------------------------------------------------------------------

export async function runImageGenerationHub(opts?: {
  allowBackToHub?: boolean;
}): Promise<"done" | "back"> {
  printPaperclipCliBanner();
  p.intro(pc.bold("Image Generation"));
  p.note(
    [
      `Model:           ${DEFAULT_MODEL}`,
      `Reference image: ${REFERENCE_IMAGE_PATH}`,
      `Prompt:          ${DEFAULT_PROMPT}`,
      "",
      "Uses the CMS SDK v1 image-generation node contract.",
      "Requires an active hosted session (growthub auth login).",
    ].join("\n"),
    "nano-banana-2 · Branded Workflow Illustration",
  );

  while (true) {
    const action = await p.select({
      message: "Image Generation",
      options: [
        {
          value: "generate-default",
          label: "🖼  Generate branded workflow illustration",
          hint: `nano-banana-2 · default prompt · growthub reference image`,
        },
        {
          value: "generate-custom",
          label: "✏️  Generate with custom prompt",
          hint: "override prompt, keep model + reference image",
        },
        ...(opts?.allowBackToHub
          ? [{ value: "__back", label: "← Back" }]
          : []),
      ],
    });

    if (p.isCancel(action)) { p.cancel("Cancelled."); process.exit(0); }
    if (action === "__back") return "back";

    if (action === "generate-default") {
      await runImageGeneration({
        prompt: DEFAULT_PROMPT,
        model: DEFAULT_MODEL,
        referenceImage: REFERENCE_IMAGE_PATH,
        saveWorkflow: false,
      });
      return "done";
    }

    if (action === "generate-custom") {
      const customPrompt = await p.text({
        message: "Enter your prompt (keep it under 25 words)",
        placeholder: DEFAULT_PROMPT,
        defaultValue: DEFAULT_PROMPT,
      });
      if (p.isCancel(customPrompt)) continue;

      const prompt = String(customPrompt).trim() || DEFAULT_PROMPT;
      const wordCount = prompt.split(/\s+/).length;
      if (wordCount > 25) {
        p.log.warn(`Prompt is ${wordCount} words — recommended max is 25.`);
      }

      await runImageGeneration({
        prompt,
        model: DEFAULT_MODEL,
        referenceImage: REFERENCE_IMAGE_PATH,
        saveWorkflow: false,
      });
      return "done";
    }
  }
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerImageGenerationCommands(program: Command): void {
  const cmd = program
    .command("image-generation")
    .description("Generate branded images via the hosted image-generation node (nano-banana-2)")
    .addHelpText("after", `
Examples:
  $ growthub image-generation                              # interactive hub
  $ growthub image-generation generate                     # default branded prompt
  $ growthub image-generation generate --prompt "..."      # custom prompt
  $ growthub image-generation generate --model nano-banana-2
`);

  cmd.action(async () => {
    await runImageGenerationHub({});
  });

  cmd
    .command("generate")
    .description("Generate an image using the CMS SDK v1 image-generation node")
    .option("--prompt <text>", "Image prompt (under 25 words recommended)", DEFAULT_PROMPT)
    .option("--model <model>", "Image model to use", DEFAULT_MODEL)
    .option(
      "--reference-image <path-or-url>",
      "Reference image path or URL",
      REFERENCE_IMAGE_PATH,
    )
    .option("--json", "Output raw JSON result")
    .action(async (opts: {
      prompt: string;
      model: string;
      referenceImage: string;
      json?: boolean;
    }) => {
      if (!opts.json) {
        printPaperclipCliBanner();
        p.intro(pc.bold("Image Generation — nano-banana-2"));
      }

      await runImageGeneration({
        prompt: opts.prompt,
        model: opts.model,
        referenceImage: opts.referenceImage,
        saveWorkflow: false,
      });
    });
}
