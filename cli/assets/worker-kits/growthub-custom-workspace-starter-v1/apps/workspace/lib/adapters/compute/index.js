/**
 * Compute provider adapter facade.
 *
 * Eagerly registers the built-in adapters so the workspace resolves compute
 * out of the box (the local machine always exists as a candidate), mirroring
 * the sandbox adapter facade. Consumers import
 * `ensureComputeAdaptersLoaded()` once before they call
 * `getComputeProviderAdapter(id)`.
 *
 * Additional adapters are ordinary files in this directory that call
 * `registerComputeProviderAdapter()` at module load — a provider is an
 * adapter plus a governed API Registry row, never a code fork.
 */

import "./default-local-machine.js";

async function ensureComputeAdaptersLoaded() {
  // Static imports above registered everything; the async shape mirrors the
  // sandbox facade so a future drop-zone loader is a non-breaking addition.
  return true;
}

export { ensureComputeAdaptersLoaded };
export {
  describeRegisteredComputeProviderAdapters,
  getComputeProviderAdapter,
  listComputeProviderAdapters,
  registerComputeProviderAdapter
} from "./compute-adapter-registry.js";
