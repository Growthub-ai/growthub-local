import {
  AGENT_ROLES,
  TICKET_STAGE_HANDOFF_MODES,
  normalizeGtmCampaignStageMetadata,
  type GtmCampaignSettings,
  type GtmCampaignStageMetadata,
  type TicketStageDefinition,
} from "@paperclipai/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

export type GtmStageDraft = TicketStageDefinition & {
  metadata?: Record<string, unknown> | null;
  expanded?: boolean;
};

type GtmCampaignSettingsCardProps = {
  settings: GtmCampaignSettings;
  onChange: (next: GtmCampaignSettings) => void;
};

type GtmStageContractEditorProps = {
  stages: GtmStageDraft[];
  currentStage: string | null;
  onChange: (stages: GtmStageDraft[]) => void;
  onAddStage: () => void;
  onRemoveStage: (index: number) => void;
  onMoveStage: (index: number, direction: -1 | 1) => void;
};

function updateStageMetadata(
  stage: GtmStageDraft,
  patch: Partial<GtmCampaignStageMetadata>,
): Record<string, unknown> {
  const current = normalizeGtmCampaignStageMetadata(stage.metadata);
  return {
    ...(stage.metadata ?? {}),
    ...current,
    ...patch,
  };
}

export function GtmCampaignSettingsCard({ settings, onChange }: GtmCampaignSettingsCardProps) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div>
        <h3 className="text-sm font-semibold">Campaign settings</h3>
        <p className="text-xs text-muted-foreground">
          Thin GTM campaign policy and knowledge controls layered on top of the canonical Paperclip ticket.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">Heartbeat pulse policy</Label>
          <Input
            value={settings.policy.heartbeatCadence ?? ""}
            onChange={(event) =>
              onChange({
                ...settings,
                policy: { ...settings.policy, heartbeatCadence: event.target.value || null },
              })}
            placeholder="Daily operator review + on-demand agent wakeups"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">Performance review cadence</Label>
          <Input
            value={settings.policy.performanceReviewCadence ?? ""}
            onChange={(event) =>
              onChange({
                ...settings,
                policy: { ...settings.policy, performanceReviewCadence: event.target.value || null },
              })}
            placeholder="Review KPI deltas every Friday"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">Campaign escalation policy</Label>
        <Textarea
          value={settings.policy.escalationPolicy ?? ""}
          onChange={(event) =>
            onChange({
              ...settings,
              policy: { ...settings.policy, escalationPolicy: event.target.value || null },
            })}
          rows={2}
          placeholder="How stage blockers, failed runs, or off-target output should escalate."
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">Default output expectations</Label>
          <Textarea
            value={settings.defaultIssueConfig.outputExpectations ?? ""}
            onChange={(event) =>
              onChange({
                ...settings,
                defaultIssueConfig: {
                  ...settings.defaultIssueConfig,
                  outputExpectations: event.target.value || null,
                },
              })}
            rows={3}
            placeholder="What every GTM issue should produce before completion."
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">Default KPI / success metric</Label>
          <Textarea
            value={settings.defaultIssueConfig.successMetric ?? ""}
            onChange={(event) =>
              onChange({
                ...settings,
                defaultIssueConfig: {
                  ...settings.defaultIssueConfig,
                  successMetric: event.target.value || null,
                },
              })}
            rows={3}
            placeholder="Response rate, meetings booked, content shipped, approvals passed, etc."
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">Knowledge capture notes</Label>
        <Textarea
          value={settings.defaultIssueConfig.knowledgeCaptureNotes ?? ""}
          onChange={(event) =>
            onChange({
              ...settings,
              defaultIssueConfig: {
                ...settings.defaultIssueConfig,
                knowledgeCaptureNotes: event.target.value || null,
              },
            })}
          rows={2}
          placeholder="What the campaign should preserve to workspace knowledge when available."
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex items-start gap-3 rounded-lg border border-border bg-background/40 px-3 py-3">
          <Checkbox
            checked={settings.knowledge.saveRunOutputs}
            onCheckedChange={(checked) =>
              onChange({
                ...settings,
                knowledge: { ...settings.knowledge, saveRunOutputs: Boolean(checked) },
              })}
          />
          <span>
            <span className="block text-sm font-medium">Save run outputs to knowledge</span>
            <span className="block text-xs text-muted-foreground">Default GTM campaign policy when knowledge capture is available.</span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-lg border border-border bg-background/40 px-3 py-3">
          <Checkbox
            checked={settings.knowledge.freezeWhenConnected}
            onCheckedChange={(checked) =>
              onChange({
                ...settings,
                knowledge: { ...settings.knowledge, freezeWhenConnected: Boolean(checked) },
              })}
          />
          <span>
            <span className="block text-sm font-medium">Freeze captured knowledge when connected</span>
            <span className="block text-xs text-muted-foreground">Keep captured GTM knowledge stable once the Growthub connection is available.</span>
          </span>
        </label>
      </div>
    </section>
  );
}

export function GtmStageContractEditor({
  stages,
  currentStage,
  onChange,
  onAddStage,
  onRemoveStage,
  onMoveStage,
}: GtmStageContractEditorProps) {
  function updateStage(index: number, patch: Partial<GtmStageDraft>) {
    onChange(stages.map((stage, stageIndex) => (stageIndex === index ? { ...stage, ...patch } : stage)));
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Stage contract</h3>
          <p className="text-xs text-muted-foreground">
            Control stage metadata, KPI expectations, SOPs, knowledge items, and handoff binding for the GTM campaign.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{stages.length} stages</Badge>
          <Button type="button" variant="outline" size="sm" onClick={onAddStage}>
            <Plus className="h-3.5 w-3.5" />
            Add stage
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {stages.map((stage, index) => {
          const stageMetadata = normalizeGtmCampaignStageMetadata(stage.metadata);
          const isCurrent = stage.key === currentStage;
          return (
            <div key={`${stage.key}-${index}`} className="rounded-lg border border-border bg-background/40">
              <div className="flex items-center justify-between gap-3 px-3 py-3">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => updateStage(index, { expanded: !stage.expanded })}
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      Step {index + 1}
                    </span>
                    <span className="truncate text-sm font-medium">{stage.label || `Stage ${index + 1}`}</span>
                    {isCurrent ? <Badge variant="outline">current</Badge> : null}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    <span>{stage.ownerRole ?? "ticket lead fallback"}</span>
                    <span>{stage.handoffMode ?? "default handoff"}</span>
                  </div>
                </button>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="icon-xs" onClick={() => onMoveStage(index, -1)} disabled={index === 0}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-xs" onClick={() => onMoveStage(index, 1)} disabled={index === stages.length - 1}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-xs" onClick={() => onRemoveStage(index)} disabled={stages.length <= 1}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {stage.expanded ? (
                <div className="grid gap-3 border-t border-border px-3 py-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground">Label</Label>
                      <Input
                        value={stage.label}
                        onChange={(event) => updateStage(index, { label: event.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground">Key</Label>
                      <Input
                        value={stage.key}
                        onChange={(event) => updateStage(index, { key: event.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground">Owner role</Label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                        value={stage.ownerRole ?? ""}
                        onChange={(event) => updateStage(index, { ownerRole: (event.target.value || null) as GtmStageDraft["ownerRole"] })}
                      >
                        <option value="">Ticket lead fallback</option>
                        {AGENT_ROLES.map((role) => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground">Handoff mode</Label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                        value={stage.handoffMode ?? ""}
                        onChange={(event) => updateStage(index, { handoffMode: (event.target.value || null) as GtmStageDraft["handoffMode"] })}
                      >
                        <option value="">Default</option>
                        {TICKET_STAGE_HANDOFF_MODES.map((mode) => (
                          <option key={mode} value={mode}>{mode}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground">Stage instructions</Label>
                      <Textarea
                        value={stage.instructions ?? ""}
                        onChange={(event) => updateStage(index, { instructions: event.target.value || null })}
                        rows={3}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground">Exit criteria</Label>
                      <Textarea
                        value={stage.exitCriteria ?? ""}
                        onChange={(event) => updateStage(index, { exitCriteria: event.target.value || null })}
                        rows={3}
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground">Stage KPI / success metric</Label>
                      <Textarea
                        value={stageMetadata?.kpis ?? ""}
                        onChange={(event) => updateStage(index, { metadata: updateStageMetadata(stage, { kpis: event.target.value || null }) })}
                        rows={2}
                        placeholder="Meetings booked, reply rate, content shipped, QA pass rate..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground">Output expectations</Label>
                      <Textarea
                        value={stageMetadata?.outputExpectations ?? ""}
                        onChange={(event) => updateStage(index, { metadata: updateStageMetadata(stage, { outputExpectations: event.target.value || null }) })}
                        rows={2}
                        placeholder="What the stage must leave behind before handoff."
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground">SOP / operator notes</Label>
                      <Textarea
                        value={stageMetadata?.sop ?? ""}
                        onChange={(event) => updateStage(index, { metadata: updateStageMetadata(stage, { sop: event.target.value || null }) })}
                        rows={2}
                        placeholder="Stage-specific SOPs, review notes, or operator guidance."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground">Knowledge items</Label>
                      <Textarea
                        value={stageMetadata?.knowledgeItems ?? ""}
                        onChange={(event) => updateStage(index, { metadata: updateStageMetadata(stage, { knowledgeItems: event.target.value || null }) })}
                        rows={2}
                        placeholder="Knowledge or frozen references the stage should bind to."
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">Stage policy</Label>
                    <Textarea
                      value={stageMetadata?.policy ?? ""}
                      onChange={(event) => updateStage(index, { metadata: updateStageMetadata(stage, { policy: event.target.value || null }) })}
                      rows={2}
                      placeholder="Heartbeat or escalation policy specific to this stage."
                    />
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
