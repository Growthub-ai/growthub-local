#!/usr/bin/env node
/**
 * Keep the one-shot network applicator idempotent as concurrent hardening
 * commits land. This does not weaken a production check: it only teaches the
 * applicator to recognize the canonical module's already-hardened mixed-DNS
 * wording so it can continue to the remaining route/lifecycle edits.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "scripts/apply-compute-network-hardening.mjs");
let source = fs.readFileSync(file, "utf8");
const oldMarker = '  `resolves to mixed public/private addresses`,';
const currentMarker = '  `returned mixed public/private DNS answers`,';
if (source.includes(oldMarker)) source = source.replace(oldMarker, currentMarker);
if (!source.includes(currentMarker)) throw new Error("network applicator mixed-DNS marker is missing");
fs.writeFileSync(file, source);
console.log("[network] applicator recognizes the canonical mixed-DNS/rebinding refusal");
