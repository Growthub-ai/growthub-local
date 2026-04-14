import fs from "node:fs";
import path from "node:path";
import { resolvePaperclipHomeDir } from "../../config/home.js";
import type {
  WorkflowHygieneRecord,
  WorkflowHygieneStore,
  WorkflowLabel,
} from "./types.js";

interface WorkflowHygieneFile {
  records: WorkflowHygieneRecord[];
}

function resolveStorePath(): string {
  return path.resolve(resolvePaperclipHomeDir(), "workflow-hygiene", "labels.json");
}

function readStoreFile(filePath: string): WorkflowHygieneFile {
  if (!fs.existsSync(filePath)) return { records: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as WorkflowHygieneFile;
    if (!Array.isArray(raw.records)) return { records: [] };
    return raw;
  } catch {
    return { records: [] };
  }
}

function writeStoreFile(filePath: string, data: WorkflowHygieneFile): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

export function inferDefaultLabel(
  name: string,
  createdAt: string,
  versionCount: number,
): WorkflowLabel {
  if (versionCount >= 3) return "canonical";
  if (name.toLowerCase().includes("experiment")) return "experimental";
  if (createdAt && Date.now() - Date.parse(createdAt) > 1000 * 60 * 60 * 24 * 90) {
    return "archived";
  }
  return "experimental";
}

export function createWorkflowHygieneStore(): WorkflowHygieneStore {
  const filePath = resolveStorePath();

  return {
    getLabel(workflowId) {
      const store = readStoreFile(filePath);
      const record = store.records.find((entry) => entry.workflowId === workflowId);
      return record?.label ?? null;
    },
    setLabel(workflowId, label) {
      const store = readStoreFile(filePath);
      const idx = store.records.findIndex((entry) => entry.workflowId === workflowId);
      const nextRecord: WorkflowHygieneRecord = {
        workflowId,
        label,
        updatedAt: new Date().toISOString(),
      };
      if (idx >= 0) {
        store.records[idx] = nextRecord;
      } else {
        store.records.push(nextRecord);
      }
      writeStoreFile(filePath, store);
    },
    list() {
      const store = readStoreFile(filePath);
      return [...store.records];
    },
  };
}
