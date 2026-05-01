/**
 * Kit Publish — pack utility.
 *
 * Creates a shareable publish metadata artifact (JSON file) in a target dir.
 * Local-first: no hosted Growthub required.
 */

import fs from "node:fs";
import path from "node:path";
import { buildPublishMetadata, type CommunityKitPublishMetadata } from "./metadata.js";

export interface PackKitResult {
  metadataPath: string;
  metadata: CommunityKitPublishMetadata;
  valid: boolean;
}

export interface PackKitOptions {
  kitRoot: string;
  outDir?: string;
  repositoryOverride?: string;
}

export function packKit(options: PackKitOptions): PackKitResult {
  const { kitRoot } = options;
  const { metadata, valid } = buildPublishMetadata({
    kitRoot,
    repositoryOverride: options.repositoryOverride,
  });

  const outDir = options.outDir ?? kitRoot;
  fs.mkdirSync(outDir, { recursive: true });

  const filename = `${metadata.kitId}-publish-metadata.json`;
  const metadataPath = path.resolve(outDir, filename);
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + "\n", "utf8");

  return { metadataPath, metadata, valid };
}
