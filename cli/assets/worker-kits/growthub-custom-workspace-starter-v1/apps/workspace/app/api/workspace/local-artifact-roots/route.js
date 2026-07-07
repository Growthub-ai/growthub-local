import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

async function readableDirectory(p) {
  try {
    const stat = await fs.stat(p);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function mountedVolumes() {
  if (process.platform !== "darwin") return [];
  const root = "/Volumes";
  if (!(await readableDirectory(root))) return [];
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const homeVolume = path.parse(os.homedir()).root;
  return entries
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => path.join(root, entry.name))
    .filter((p) => p !== homeVolume);
}

async function rootOption(value, label, kind) {
  let diskFreeGB = 0;
  let available = false;
  try {
    await fs.mkdir(value, { recursive: true });
    const stat = await fs.statfs(value);
    diskFreeGB = Math.floor(Number(stat.bavail * stat.bsize || 0) / 1e9);
    available = true;
  } catch {
    available = false;
  }
  return { value, label, kind, available, diskFreeGB };
}

export async function GET() {
  const workspaceRoot = path.join(process.cwd(), "artifacts");
  const volumes = await mountedVolumes();
  const roots = [
    await rootOption("./artifacts", "Workspace artifacts", "workspace"),
    ...(await Promise.all(volumes.map((value) => rootOption(value, path.basename(value), "mounted-volume")))),
    { value: "__custom__", label: "Custom path...", kind: "custom" },
  ];
  const workspaceDisk = await rootOption(workspaceRoot, "Workspace artifacts", "workspace-absolute");
  return NextResponse.json({
    ok: true,
    roots,
    system: {
      ramGB: Math.floor(os.totalmem() / 1e9),
      platform: process.platform,
      workspaceDiskFreeGB: workspaceDisk.diskFreeGB,
    },
  });
}
