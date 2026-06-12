/**
 * Sandbox adapter facade.
 *
 * Eagerly registers the default `local-process` adapter so the workspace works
 * out of the box, then loads any drop-zone adapter files added by the fork.
 * Routes import `ensureSandboxAdaptersLoaded()` once before they call
 * `getSandboxAdapter(id)`.
 */

import "./default-local-process.js";
import "./default-local-agent-host.js";
import "./default-local-intelligence.js";
import "./adapters/local-intelligence-browser-access.js";
import { loadAllSandboxAdapters } from "./adapter-loader.js";

let baseLoaded = true; // default-local-process registered via static import
let dropZoneLoadStarted = false;
let dropZoneLoadComplete = null;

async function ensureSandboxAdaptersLoaded() {
  if (!baseLoaded) baseLoaded = true;
  if (!dropZoneLoadStarted) {
    dropZoneLoadStarted = true;
    dropZoneLoadComplete = loadAllSandboxAdapters();
  }
  await dropZoneLoadComplete;
}

export { ensureSandboxAdaptersLoaded };
export {
  describeRegisteredSandboxAdapters,
  getSandboxAdapter,
  listRegisteredSandboxAdapters,
  registerSandboxAdapter
} from "./sandbox-adapter-registry.js";
