/**
 * Governed delete lifecycle — impact preview, config cascade, sidecar key discovery.
 * Pure functions; sidecar writes flow through POST /api/workspace/cleanup-sidecar.
 */

import { parseOrchestrationGraph } from "./orchestration-graph.js";
import { parseSandboxEnvRefs, sandboxRunSourceId } from "./workspace-data-model.js";

const NAV_FOLDERS_OBJECT_ID = "nav-folders";

function rowSlug(row) {
  return String(row?.Name || row?.name || row?.slug || row?.id || "").trim();
}

function collectRegistryIdReferences(workspaceConfig, registryId) {
  const impacts = [];
  const id = String(registryId || "").trim();
  if (!id) return impacts;
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  for (const object of objects) {
    const rows = Array.isArray(object.rows) ? object.rows : [];
    rows.forEach((row, rowIndex) => {
      if (object.objectType === "data-source" && String(row?.registryId || "").trim() === id) {
        impacts.push({
          kind: "data-source-registryId",
          objectId: object.id,
          objectLabel: object.label || object.id,
          rowIndex,
          rowLabel: rowSlug(row) || `row ${rowIndex + 1}`
        });
      }
      if (object.objectType === "sandbox-environment" && String(row?.schedulerRegistryId || "").trim() === id) {
        impacts.push({
          kind: "sandbox-schedulerRegistryId",
          objectId: object.id,
          objectLabel: object.label || object.id,
          rowIndex,
          rowLabel: rowSlug(row) || `row ${rowIndex + 1}`
        });
      }
      if (object.objectType === "sandbox-environment") {
        const graph = parseOrchestrationGraph(row?.orchestrationConfig || row?.orchestrationGraph);
        for (const node of graph?.nodes || []) {
          const nodeRegistry = String(node?.config?.registryId || node?.config?.integrationId || "").trim();
          if (nodeRegistry === id) {
            impacts.push({
              kind: "workflow-node-registryId",
              objectId: object.id,
              objectLabel: object.label || object.id,
              rowIndex,
              rowLabel: rowSlug(row) || `row ${rowIndex + 1}`,
              nodeId: String(node?.id || "")
            });
          }
        }
      }
    });
  }
  return impacts;
}

function collectNavFolderImpacts(workspaceConfig, objectId, rowId) {
  const impacts = [];
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const navObject = objects.find((o) => o?.id === NAV_FOLDERS_OBJECT_ID);
  if (!navObject) return impacts;
  const rows = Array.isArray(navObject.rows) ? navObject.rows : [];
  rows.forEach((folder, folderIndex) => {
    const items = Array.isArray(folder?.items) ? folder.items : [];
    items.forEach((item, itemIndex) => {
      if (item?.type === "workflow" && String(item?.objectId || "") === objectId && String(item?.rowId || "") === rowId) {
        impacts.push({
          kind: "nav-folder-workflow",
          folderIndex,
          itemIndex,
          folderLabel: String(folder?.name || folder?.label || folder?.id || "Folder")
        });
      }
    });
  });
  return impacts;
}

function collectWidgetBindingImpacts(workspaceConfig, sourceId) {
  const impacts = [];
  const id = String(sourceId || "").trim();
  if (!id) return impacts;
  const widgets = Array.isArray(workspaceConfig?.canvas?.widgets) ? workspaceConfig.canvas.widgets : [];
  widgets.forEach((widget) => {
    const binding = widget?.binding;
    if (binding?.sourceId === id || binding?.objectId === id) {
      impacts.push({
        kind: "widget-binding",
        widgetId: String(widget?.id || ""),
        widgetKind: String(widget?.kind || "")
      });
    }
  });
  return impacts;
}

/**
 * Compute delete impact for one or more row indexes in a governed table.
 */
function computeDeleteImpact(workspaceConfig, table, rowIndexes) {
  const warnings = [];
  const sidecarKeys = [];
  const fkBreaks = [];
  const navItems = [];
  const widgetBindings = [];

  if (!table?.mutable || !Array.isArray(rowIndexes)) {
    return { warnings, sidecarKeys, fkBreaks, navItems, widgetBindings };
  }

  const rows = Array.isArray(table.rows) ? table.rows : [];
  const objectId = String(table.objectId || "").trim();

  for (const rowIndex of rowIndexes) {
    const row = rows[rowIndex];
    if (!row) continue;
    const slug = rowSlug(row);

    if (table.objectType === "sandbox-environment" && objectId && slug) {
      sidecarKeys.push(sandboxRunSourceId(objectId, slug));
      navItems.push(...collectNavFolderImpacts(workspaceConfig, objectId, slug));
    }

    if (table.objectType === "api-registry") {
      const integrationId = String(row?.integrationId || row?.id || slug).trim();
      if (integrationId) {
        fkBreaks.push(...collectRegistryIdReferences(workspaceConfig, integrationId));
      }
      const sourceId = String(row?.sourceId || "").trim();
      if (sourceId) sidecarKeys.push(sourceId);
    }

    if (table.objectType === "data-source") {
      const sourceId = String(row?.sourceId || "").trim();
      if (sourceId) {
        sidecarKeys.push(sourceId);
        widgetBindings.push(...collectWidgetBindingImpacts(workspaceConfig, sourceId));
      }
    }
  }

  if (fkBreaks.length) {
    warnings.push(`${fkBreaks.length} cross-reference(s) will be cleared or left dangling unless repaired.`);
  }
  if (navItems.length) {
    warnings.push(`${navItems.length} workflow rail shortcut(s) will be removed.`);
  }
  if (sidecarKeys.length) {
    warnings.push(`${sidecarKeys.length} sidecar history key(s) can be pruned.`);
  }
  if (widgetBindings.length) {
    warnings.push(`${widgetBindings.length} widget binding(s) reference deleted source records.`);
  }

  return {
    warnings,
    sidecarKeys: [...new Set(sidecarKeys)],
    fkBreaks,
    navItems,
    widgetBindings
  };
}

function clearRegistryFk(workspaceConfig, registryId) {
  const id = String(registryId || "").trim();
  if (!id) return workspaceConfig;
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  return {
    ...workspaceConfig,
    dataModel: {
      ...workspaceConfig.dataModel,
      objects: objects.map((object) => {
        const rows = Array.isArray(object.rows) ? object.rows : [];
        if (object.objectType === "data-source") {
          return {
            ...object,
            rows: rows.map((row) => (
              String(row?.registryId || "").trim() === id ? { ...row, registryId: "" } : row
            ))
          };
        }
        if (object.objectType === "sandbox-environment") {
          return {
            ...object,
            rows: rows.map((row) => {
              let next = row;
              if (String(row?.schedulerRegistryId || "").trim() === id) {
                next = { ...next, schedulerRegistryId: "" };
              }
              const graph = parseOrchestrationGraph(row?.orchestrationConfig || row?.orchestrationGraph);
              if (!graph?.nodes?.length) return next;
              const nodes = graph.nodes.map((node) => {
                const nodeRegistry = String(node?.config?.registryId || node?.config?.integrationId || "").trim();
                if (nodeRegistry !== id) return node;
                return {
                  ...node,
                  config: { ...(node.config || {}), registryId: "", integrationId: "" }
                };
              });
              const serialized = JSON.stringify({ ...graph, nodes });
              return {
                ...next,
                orchestrationConfig: next.orchestrationConfig !== undefined ? serialized : next.orchestrationConfig,
                orchestrationGraph: next.orchestrationGraph !== undefined ? serialized : next.orchestrationGraph
              };
            })
          };
        }
        return object;
      })
    }
  };
}

function removeNavFolderItems(workspaceConfig, navItems) {
  if (!navItems.length) return workspaceConfig;
  const objects = Array.isArray(workspaceConfig?.dataModel?.objects) ? workspaceConfig.dataModel.objects : [];
  const removeSet = new Set(navItems.map((item) => `${item.folderIndex}:${item.itemIndex}`));
  return {
    ...workspaceConfig,
    dataModel: {
      ...workspaceConfig.dataModel,
      objects: objects.map((object) => {
        if (object?.id !== NAV_FOLDERS_OBJECT_ID) return object;
        const rows = Array.isArray(object.rows) ? object.rows : [];
        return {
          ...object,
          rows: rows.map((folder, folderIndex) => {
            const items = Array.isArray(folder?.items) ? folder.items : [];
            const nextItems = items.filter((_, itemIndex) => !removeSet.has(`${folderIndex}:${itemIndex}`));
            return nextItems.length === items.length ? folder : { ...folder, items: nextItems };
          })
        };
      })
    }
  };
}

/**
 * Apply governed delete: filter rows + cascade FK/nav cleanup.
 */
function cascadeDeleteRows(workspaceConfig, table, rowIndexes) {
  if (!table?.mutable) {
    return { config: workspaceConfig, impact: computeDeleteImpact(workspaceConfig, table, rowIndexes) };
  }

  const impact = computeDeleteImpact(workspaceConfig, table, rowIndexes);
  let config = workspaceConfig;
  const rows = Array.isArray(table.rows) ? table.rows : [];

  for (const rowIndex of rowIndexes) {
    const row = rows[rowIndex];
    if (!row) continue;
    if (table.objectType === "api-registry") {
      const integrationId = String(row?.integrationId || row?.id || rowSlug(row)).trim();
      if (integrationId) config = clearRegistryFk(config, integrationId);
    }
  }

  config = removeNavFolderItems(config, impact.navItems);

  const deleteSet = new Set(rowIndexes);
  const objects = Array.isArray(config?.dataModel?.objects) ? config.dataModel.objects : [];
  config = {
    ...config,
    dataModel: {
      ...config.dataModel,
      objects: objects.map((object) => {
        if (object?.id !== table.objectId) return object;
        return {
          ...object,
          rows: rows.filter((_, index) => !deleteSet.has(index))
        };
      })
    }
  };

  return { config, impact };
}

export {
  NAV_FOLDERS_OBJECT_ID,
  cascadeDeleteRows,
  collectNavFolderImpacts,
  collectRegistryIdReferences,
  computeDeleteImpact
};
