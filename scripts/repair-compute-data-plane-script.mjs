#!/usr/bin/env node
/** Tighten the generated data-plane applicator before it touches production files. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "scripts/apply-compute-data-plane.mjs");
let source = fs.readFileSync(file, "utf8");

// The bearer corpus grant belongs only to the selected provider's allocation /
// execution context. Capacity probes for non-selected candidates must never see
// it. Remove the applicator step that would have added it to quote contexts.
const label = '  "quote context dataset access",';
const labelAt = source.indexOf(label);
if (labelAt >= 0) {
  const blockStart = source.lastIndexOf("execution = replaceOrSkip(", labelAt);
  const blockEnd = source.indexOf("\n);", labelAt);
  if (blockStart < 0 || blockEnd < 0) throw new Error("could not isolate quote-context patch block");
  source = `${source.slice(0, blockStart)}${source.slice(blockEnd + 3)}`;
}

// Make the applicator idempotency marker match the actual wired field order.
source = source.replace(
  '`deliveryStatus: "issued",\\n      manifestHash: payload.manifestHash`',
  '`issuedAt: payload.issuedAt`',
);

fs.writeFileSync(file, source);
console.log("[data-plane] applicator repaired: grants are selected-provider-only and rerunnable");
