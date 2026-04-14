import pc from "picocolors";
import { inferDefaultLabel } from "./labels.js";
import type { WorkflowHygieneStore, WorkflowLabel } from "./types.js";

export function renderWorkflowLabel(label: WorkflowLabel): string {
  if (label === "canonical") return pc.green("canonical");
  if (label === "archived") return pc.dim("archived");
  return pc.yellow("experimental");
}

export function enrichWorkflowSummaries<T extends {
  workflowId: string;
  name: string;
  createdAt: string;
  versionCount?: number;
}>(
  entries: T[],
  store: WorkflowHygieneStore,
): Array<T & { workflowLabel: WorkflowLabel }> {
  return entries.map((entry) => {
    const workflowLabel = store.getLabel(entry.workflowId)
      ?? inferDefaultLabel(entry.name, entry.createdAt, entry.versionCount ?? 0);
    return { ...entry, workflowLabel };
  });
}
