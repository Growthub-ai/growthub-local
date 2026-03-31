import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Agent, Issue, Ticket } from "@paperclipai/shared";
import { readGtmCampaignMetadata, type GtmCampaignSettings } from "@paperclipai/shared";
import { issuesApi } from "@/api/issues";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/context/ToastContext";

type GtmIssueLauncherModalProps = {
  open: boolean;
  onClose: () => void;
  companyId: string;
  ticket: Ticket;
  agents: Agent[];
  settings: GtmCampaignSettings;
  onSuccess?: (issue: Issue) => void;
};

const ISSUE_PRIORITY_OPTIONS = ["critical", "high", "medium", "low"] as const;

function buildIssueDescription(input: {
  description: string;
  outputExpectations: string;
  successMetric: string;
  saveRunOutputs: boolean;
}) {
  const sections: string[] = [];
  if (input.description.trim()) {
    sections.push(input.description.trim());
  }
  if (input.outputExpectations.trim()) {
    sections.push(`## Output Expectations\n${input.outputExpectations.trim()}`);
  }
  if (input.successMetric.trim()) {
    sections.push(`## KPI / Success Metric\n${input.successMetric.trim()}`);
  }
  if (input.saveRunOutputs) {
    sections.push("## Knowledge Capture\nSave useful outputs back to workspace knowledge when the Growthub connection is available.");
  }
  return sections.join("\n\n");
}

export function GtmIssueLauncherModal({
  open,
  onClose,
  companyId,
  ticket,
  agents,
  settings,
  onSuccess,
}: GtmIssueLauncherModalProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const ticketMetadata = readGtmCampaignMetadata(ticket.metadata);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<string>("medium");
  const [assigneeAgentId, setAssigneeAgentId] = useState(ticket.leadAgentId ?? "");
  const [outputExpectations, setOutputExpectations] = useState(settings.defaultIssueConfig.outputExpectations ?? "");
  const [successMetric, setSuccessMetric] = useState(settings.defaultIssueConfig.successMetric ?? "");
  const [saveRunOutputs, setSaveRunOutputs] = useState(settings.knowledge.saveRunOutputs);

  const createIssue = useMutation({
    mutationFn: async () => {
      const body = buildIssueDescription({
        description,
        outputExpectations,
        successMetric,
        saveRunOutputs,
      });

      return issuesApi.create(companyId, {
        ticketId: ticket.id,
        ticketStage: null,
        title: title.trim(),
        description: body || null,
        priority,
        status: "backlog",
        assigneeAgentId: assigneeAgentId || null,
      });
    },
    onSuccess: async (issue) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["gtm", "tickets", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "ticket-detail", ticket.id] }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "issues", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "inbox", companyId] }),
      ]);
      onSuccess?.(issue);
      pushToast({
        title: "Campaign task created",
        body: "The GTM issue launcher created a new campaign task.",
        tone: "success",
      });
      onClose();
    },
    onError: (error) => {
      pushToast({
        title: "Task creation failed",
        body: error instanceof Error ? error.message : "Failed to create GTM task.",
        tone: "error",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto" style={{ width: "min(920px, 92vw)", maxWidth: "92vw" }}>
        <DialogHeader>
          <DialogTitle>Launch GTM task</DialogTitle>
          <DialogDescription>
            Create a GTM issue inside this campaign with execution context and workspace agent controls.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Issue title</Label>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Build the first outbound asset set for this campaign" />
            </div>

            <div className="space-y-2">
              <Label>Execution brief</Label>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={5}
                placeholder="Describe the task, constraints, dependencies, and what the agent should execute now."
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Output expectations</Label>
                <Textarea
                  value={outputExpectations}
                  onChange={(event) => setOutputExpectations(event.target.value)}
                  rows={3}
                  placeholder="What the task must leave behind for operators."
                />
              </div>
              <div className="space-y-2">
                <Label>KPI / success metric</Label>
                <Textarea
                  value={successMetric}
                  onChange={(event) => setSuccessMetric(event.target.value)}
                  rows={3}
                  placeholder="How this issue should be judged for performance."
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2 rounded-xl border border-border bg-card p-4">
              <div>
                <p className="text-sm font-semibold">Issue configuration</p>
                <p className="text-xs text-muted-foreground">Thin GTM launcher settings layered on top of the shared issue API.</p>
              </div>

              <div className="space-y-2">
                <Label>Assign agent</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={assigneeAgentId}
                  onChange={(event) => setAssigneeAgentId(event.target.value)}
                >
                  <option value="">Ticket lead fallback</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>{agent.name} ({agent.role})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label>Priority</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={priority}
                  onChange={(event) => setPriority(event.target.value)}
                >
                  {ISSUE_PRIORITY_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>

              <label className="flex items-start gap-3 rounded-lg border border-border bg-background/40 px-3 py-3">
                <input
                  type="checkbox"
                  checked={saveRunOutputs}
                  onChange={(event) => setSaveRunOutputs(event.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium">Save to knowledge when available</span>
                  <span className="block text-xs text-muted-foreground">
                    {ticketMetadata?.settings?.knowledge.freezeWhenConnected
                      ? "Knowledge capture is configured to stay frozen when the Growthub connection is available."
                      : "Capture useful run outputs back into workspace knowledge when possible."}
                  </span>
                </span>
              </label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={createIssue.isPending}>Cancel</Button>
          <Button onClick={() => createIssue.mutate()} disabled={!title.trim() || createIssue.isPending}>
            {createIssue.isPending ? "Creating..." : "Create GTM Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
