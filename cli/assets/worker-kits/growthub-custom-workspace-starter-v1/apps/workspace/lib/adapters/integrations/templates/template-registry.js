/**
 * Resolver template registry — operator-facing seeds for API Registry / Data Source rows.
 *
 * @typedef {Object} ResolverTemplate
 * @property {"growthub-resolver-template-v1"} schemaVersion
 * @property {string} templateId
 * @property {string} label
 * @property {"http"|"mcp"|"chrome"|"tool"|"custom"|"nango"} connectorKind
 * @property {Array<"listEntities"|"fetchRecords"|"runAction">} capabilities
 * @property {Object} apiRegistryDefaults
 * @property {string} apiRegistryDefaults.integrationId
 * @property {string} [apiRegistryDefaults.authRef]
 * @property {string} [apiRegistryDefaults.baseUrl]
 * @property {string} [apiRegistryDefaults.endpoint]
 * @property {"GET"|"POST"|"PUT"|"PATCH"|"DELETE"} [apiRegistryDefaults.method]
 * @property {{ objectType: "data-source", binding: { sourceStorage: string } }} [dataSourceDefaults]
 * @property {Array<{ name: string, label: string, type: string, required?: boolean }>} configSchema
 * @property {Array<"data-source"|"sandbox-local"|"sandbox-serverless">} supportedLanes
 */

import customHttp from "./custom-http.js";
import webhook from "./webhook.js";
import mcpTool from "./mcp-tool.js";
import chromeBridge from "./chrome-bridge.js";
import genericCrm from "./generic-crm.js";
import genericSpreadsheet from "./generic-spreadsheet.js";
import genericProjectManagement from "./generic-project-management.js";
import genericCommerce from "./generic-commerce.js";
import nango from "./nango.js";

const ALL = [
  customHttp,
  webhook,
  mcpTool,
  chromeBridge,
  genericCrm,
  genericSpreadsheet,
  genericProjectManagement,
  genericCommerce,
  nango
];

function listResolverTemplates() {
  return ALL.map((t) => ({ ...t }));
}

function getResolverTemplate(templateId) {
  const id = String(templateId || "").trim();
  return ALL.find((t) => t.templateId === id) || null;
}

export { listResolverTemplates, getResolverTemplate };
