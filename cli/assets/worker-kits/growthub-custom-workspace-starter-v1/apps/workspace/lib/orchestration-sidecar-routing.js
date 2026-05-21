/**
 * Pure routing for connector menu → node + config tab (sidecar UX contract).
 */

function resolveConnectorAction({ from, to, action }) {
  const result = { nodeId: "input", tab: "node" };
  if (action === "filter") {
    if (to === "transform" || from === "api-request") {
      result.nodeId = "transform";
    } else {
      result.nodeId = "input";
    }
    result.tab = "filters";
  } else if (action === "map") {
    result.nodeId = "transform";
    result.tab = "node";
  } else if (action === "preview") {
    result.nodeId = "result";
    result.tab = "preview";
  }
  return result;
}

export { resolveConnectorAction };
