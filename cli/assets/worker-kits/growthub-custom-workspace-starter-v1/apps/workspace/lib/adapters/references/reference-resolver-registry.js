/**
 * Reference resolver registry — dispatches option collection strategies.
 * Keeps the same pattern as source-resolver-registry without duplicating provider logic.
 */

import { collectReferenceOptions } from "./collect-reference-options.js";

const strategies = {
  default: collectReferenceOptions
};

function resolveReferenceOptions(strategyId, workspaceConfig, parsed) {
  const run = strategies[strategyId] || strategies.default;
  return run(workspaceConfig, parsed);
}

export { resolveReferenceOptions, collectReferenceOptions };
