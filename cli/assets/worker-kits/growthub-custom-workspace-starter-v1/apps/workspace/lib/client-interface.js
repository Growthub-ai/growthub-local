/**
 * Client Interface derivation — client-interface-v1.
 *
 * The client-interface contract is DATA in the governed artifact: rows of the
 * `client-interface` Data Model object (objectType "custom", columns
 * Name/slotId/kind/value/surface/description). Slots ride the existing
 * `dataModel` PATCH allowlist — there is no new write path, no new top-level
 * config key, and no schema widening. Templates seed the slot rows
 * (templates/seeded-configs/custom-app-client.config.json); hosted control
 * planes edit slot VALUES through the same governed PATCH every other object
 * uses.
 *
 * `interface.mode = "client"` puts the runtime in the reduced client surface:
 * rail renders only nav-folder items plus slot-enabled surfaces; operator
 * routes (Data Model, Settings, Training, Workspace Map, Workspace Lens)
 * render an honest not-available state instead of their surface. The mode is
 * fail-closed for surface EXPOSURE (anything not explicitly enabled by a slot
 * stays hidden in client mode) and fail-open for OPERATOR continuity (a
 * missing or malformed client-interface object means operator mode — the
 * blank starter and every existing workspace are unchanged).
 *
 * Everything here is PURE derivation over workspaceConfig: no mutation, no
 * fetches, never throws on partial config.
 */

const CLIENT_INTERFACE_OBJECT_ID = "client-interface";
const MODE_SLOT_ID = "interface.mode";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeString(value) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function findClientInterfaceObject(workspaceConfig) {
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects)
    ? workspaceConfig.dataModel.objects
    : [];
  return objects.find((o) => isPlainObject(o) && o.id === CLIENT_INTERFACE_OBJECT_ID) || null;
}

function listSlotRows(workspaceConfig) {
  const object = findClientInterfaceObject(workspaceConfig);
  const rows = Array.isArray(object?.rows) ? object.rows : [];
  return rows.filter((r) => isPlainObject(r) && safeString(r.slotId).trim());
}

/**
 * Derive the client-interface state from a workspace config.
 *
 * Returns:
 *   {
 *     mode: "client" | "operator",
 *     isClient: boolean,
 *     slots: { [slotId]: { kind, value, surface, description } },
 *     slotText(slotId, fallback): string,
 *     slotBool(slotId, fallback): boolean,
 *   }
 */
export function deriveClientInterface(workspaceConfig) {
  const slots = {};
  for (const row of listSlotRows(workspaceConfig)) {
    const slotId = safeString(row.slotId).trim();
    slots[slotId] = {
      kind: safeString(row.kind).trim(),
      value: safeString(row.value),
      surface: safeString(row.surface).trim(),
      description: safeString(row.description),
    };
  }
  // Client mode only on the exact declared value — anything else (absent
  // object, absent row, unexpected value) is operator mode, so existing
  // workspaces are untouched.
  const mode = slots[MODE_SLOT_ID]?.value === "client" ? "client" : "operator";

  const slotText = (slotId, fallback = "") => {
    const value = safeString(slots[slotId]?.value).trim();
    return value || fallback;
  };
  const slotBool = (slotId, fallback = false) => {
    const raw = safeString(slots[slotId]?.value).trim().toLowerCase();
    if (raw === "true") return true;
    if (raw === "false") return false;
    return fallback;
  };

  return { mode, isClient: mode === "client", slots, slotText, slotBool };
}

/** Operator surfaces that render the not-available state in client mode. */
export const CLIENT_MODE_BLOCKED_SURFACES = Object.freeze([
  "/data-model",
  "/settings",
  "/training",
  "/workspace-map",
  "/workspace-lens",
]);

export function isClientModeBlockedPath(pathname) {
  const p = safeString(pathname);
  return CLIENT_MODE_BLOCKED_SURFACES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`) || p.startsWith(`${prefix}?`));
}
