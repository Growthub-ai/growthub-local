import { NextResponse } from "next/server";
import { readAdapterConfig } from "@/lib/adapters/env";
import { describeGenerativeAdapter } from "@/lib/adapters/generative/index";
import { pipelineStages, stageStatus } from "@/lib/domain/pipeline";

export const dynamic = "force-dynamic";

export function GET() {
  const config = readAdapterConfig();
  const generative = describeGenerativeAdapter();

  return NextResponse.json({
    kit: "growthub-creative-video-pipeline-v1",
    adapter: generative,
    config: {
      generativeAdapter: config.generativeAdapter,
      videoUseHome: config.videoUseHome,
      hasElevenLabsKey: config.hasElevenLabsKey,
      hasBridgeToken: config.hasBridgeToken,
      videoModelProvider: config.videoModelProvider,
    },
    stages: pipelineStages.map((s) => ({
      ...s,
      status: stageStatus.PENDING,
    })),
  });
}
