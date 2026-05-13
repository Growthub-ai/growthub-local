/**
 * Local workspace-config reference options (dataModel.objects[] rows).
 */

import { resolveLocalReferenceOptions } from "@/lib/workspace-data-model";

function resolveLocalWorkspaceOptions(workspaceConfig, params) {
  return resolveLocalReferenceOptions(workspaceConfig, params);
}

export { resolveLocalWorkspaceOptions };
