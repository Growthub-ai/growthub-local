import { NextResponse } from "next/server";

async function POST() {
  return NextResponse.json(
    {
      error: "chat execution is hosted in gh-app",
      guidance: "V1 of Workspace Builder Runtime does not execute hosted agents from the UI. Use `growthub bridge agents inspect <slug>` and the hosted runtime."
    },
    { status: 501 }
  );
}

export { POST };
