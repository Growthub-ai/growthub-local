import {
  type GtmCampaignSettings,
} from "@paperclipai/shared";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const HEARTBEAT_OPTIONS = [
  { value: "", label: "None" },
  { value: "Daily operator review + on-demand agent wakeups", label: "Daily review + on-demand" },
  { value: "Twice-daily check-in with operator sign-off", label: "Twice-daily check-in" },
  { value: "Weekly batch review", label: "Weekly batch review" },
  { value: "On-demand only", label: "On-demand only" },
] as const;

const REVIEW_CADENCE_OPTIONS = [
  { value: "", label: "None" },
  { value: "Review KPI deltas every Friday", label: "Weekly (Friday)" },
  { value: "Review KPI deltas every Monday", label: "Weekly (Monday)" },
  { value: "Review KPI deltas bi-weekly", label: "Bi-weekly" },
  { value: "Review KPI deltas monthly", label: "Monthly" },
] as const;

type GtmCampaignSettingsCardProps = {
  settings: GtmCampaignSettings;
  onChange: (next: GtmCampaignSettings) => void;
};

export function GtmCampaignSettingsCard({ settings, onChange }: GtmCampaignSettingsCardProps) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div>
        <h3 className="text-sm font-semibold">Campaign settings</h3>
        <p className="text-xs text-muted-foreground">
          Campaign policy and knowledge controls for this GTM workflow.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">Heartbeat policy</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={settings.policy.heartbeatCadence ?? ""}
            onChange={(event) =>
              onChange({
                ...settings,
                policy: { ...settings.policy, heartbeatCadence: event.target.value || null },
              })}
          >
            {HEARTBEAT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">Performance review cadence</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            value={settings.policy.performanceReviewCadence ?? ""}
            onChange={(event) =>
              onChange({
                ...settings,
                policy: { ...settings.policy, performanceReviewCadence: event.target.value || null },
              })}
          >
            {REVIEW_CADENCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">Escalation policy</Label>
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
            placeholder="What every issue should produce before completion."
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
            placeholder="Response rate, meetings booked, content shipped, etc."
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
          placeholder="What the campaign should preserve to workspace knowledge."
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
            <span className="block text-xs text-muted-foreground">Capture useful outputs when knowledge is available.</span>
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
            <span className="block text-sm font-medium">Freeze knowledge when connected</span>
            <span className="block text-xs text-muted-foreground">Keep knowledge stable once the Growthub connection is available.</span>
          </span>
        </label>
      </div>
    </section>
  );
}
