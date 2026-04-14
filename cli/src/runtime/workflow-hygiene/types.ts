export type WorkflowLabel = "canonical" | "experimental" | "archived";

export interface WorkflowHygieneRecord {
  workflowId: string;
  label: WorkflowLabel;
  updatedAt: string;
}

export interface WorkflowHygieneStore {
  getLabel(workflowId: string): WorkflowLabel | null;
  setLabel(workflowId: string, label: WorkflowLabel): void;
  list(): WorkflowHygieneRecord[];
}
