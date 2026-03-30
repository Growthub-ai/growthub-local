import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buildGtmCampaignMetadata,
  buildTicketStageOrder,
  normalizeGtmCampaignSettings,
  normalizeTicketStageDefinitions,
  type GtmCampaignSettings,
  type Agent,
  type Ticket,
  type TicketStageDefinition,
} from "@paperclipai/shared";
import { agentsApi } from "@/api/agents";
import { gtmApi, type GtmCampaignDraft } from "@/api/gtm";
import { ticketsApi } from "@/api/tickets";
import { GtmCampaignSettingsCard, GtmStageContractEditor, type GtmStageDraft } from "@/components/GtmCampaignContracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  Bot,
  Check,
  Loader2,
  PencilLine,
  Send,
  Settings2,
  Sparkles,
} from "lucide-react";

const GTM_METADATA = {
  product: "gtm",
  surfaceProfile: "gtm",
  entity: "campaign",
} as const;

const AI_DRAFT_PROFILES = [
  { value: "custom", label: "Custom workflow" },
  { value: "outbound", label: "Outbound campaign" },
  { value: "launch", label: "Launch campaign" },
  { value: "nurture", label: "Lifecycle nurture" },
  { value: "partnership", label: "Partnership motion" },
] as const;

type GtmCampaignModalProps = {
  open: boolean;
  onClose: () => void;
  companyId: string;
  onSuccess?: (ticket: Ticket) => void;
};

type EditorState = {
  title: string;
  description: string;
  instructions: string;
  targetAudience: string;
  offer: string;
  successDefinition: string;
  leadAgentId: string;
  settings: GtmCampaignSettings;
  stageDrafts: GtmStageDraft[];
};

type BuilderStep = "chooser" | "editor";

function createBlankStage(index: number): GtmStageDraft {
  return {
    key: `stage_${index}`,
    label: "",
    kind: null,
    ownerRole: null,
    handoffMode: null,
    instructions: null,
    exitCriteria: null,
    metadata: null,
    expanded: true,
  };
}

function createStageDrafts(stageDefinitions?: TicketStageDefinition[] | null): GtmStageDraft[] {
  if (!stageDefinitions || stageDefinitions.length === 0) {
    return [createBlankStage(1)];
  }

  return normalizeTicketStageDefinitions({ stageDefinitions }).map((stage, index) => ({
    ...stage,
    expanded: index === 0,
  }));
}

function createEditorState(leadAgentId = ""): EditorState {
  return {
    title: "",
    description: "",
    instructions: "",
    targetAudience: "",
    offer: "",
    successDefinition: "",
    leadAgentId,
    settings: normalizeGtmCampaignSettings(null),
    stageDrafts: createStageDrafts(),
  };
}

function serializeEditorState(state: EditorState): string {
  const normalizedStageDefinitions = normalizeTicketStageDefinitions({
    stageDefinitions: state.stageDrafts.map((stage, index) => ({
      key: stage.key?.trim() || `stage_${index + 1}`,
      label: stage.label?.trim() || `Stage ${index + 1}`,
      kind: stage.kind ?? null,
      ownerRole: stage.ownerRole ?? null,
      handoffMode: stage.handoffMode ?? null,
      instructions: stage.instructions ?? null,
      exitCriteria: stage.exitCriteria ?? null,
      metadata: stage.metadata ?? null,
    })),
  });

  return JSON.stringify({
    title: state.title.trim(),
    description: state.description.trim(),
    instructions: state.instructions.trim(),
    targetAudience: state.targetAudience.trim(),
    offer: state.offer.trim(),
    successDefinition: state.successDefinition.trim(),
    leadAgentId: state.leadAgentId || "",
    settings: state.settings,
    stageDefinitions: normalizedStageDefinitions,
  });
}

function stageCountLabel(count: number) {
  return `${count} ${count === 1 ? "stage" : "stages"}`;
}

function mapDraftToEditorState(draft: GtmCampaignDraft, fallbackLeadAgentId: string): EditorState {
  return {
    title: draft.title ?? "",
    description: draft.description ?? "",
    instructions: draft.instructions ?? "",
    targetAudience: draft.targetAudience ?? "",
    offer: draft.offer ?? "",
    successDefinition: draft.successDefinition ?? "",
    leadAgentId: draft.leadAgentId ?? fallbackLeadAgentId,
    settings: normalizeGtmCampaignSettings(null),
    stageDrafts: createStageDrafts(draft.stageDefinitions),
  };
}

export function GtmCampaignModal({ open, onClose, companyId, onSuccess }: GtmCampaignModalProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const titleRef = useRef<HTMLInputElement>(null);
  const scratchCardRef = useRef<HTMLButtonElement>(null);
  const initialSnapshotRef = useRef<string>("");

  const [builderStep, setBuilderStep] = useState<BuilderStep>("chooser");
  const [editorState, setEditorState] = useState<EditorState>(() => createEditorState());
  const [aiProfile, setAiProfile] = useState<(typeof AI_DRAFT_PROFILES)[number]["value"]>("custom");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiExtendExisting, setAiExtendExisting] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [aiConfirmOpen, setAiConfirmOpen] = useState(false);

  const { data: agents = [] } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: open,
  });

  const ceoAgent = useMemo(
    () => agents.find((agent) => agent.role === "ceo") ?? agents[0] ?? null,
    [agents],
  );

  useEffect(() => {
    if (!open) return;
    const next = createEditorState(ceoAgent?.id ?? "");
    setBuilderStep("chooser");
    setEditorState(next);
    setAiProfile("custom");
    setAiPrompt("");
    setAiExtendExisting(false);
    setCloseConfirmOpen(false);
    setAiConfirmOpen(false);
    initialSnapshotRef.current = serializeEditorState(next);
    window.setTimeout(() => scratchCardRef.current?.focus(), 80);
  }, [ceoAgent?.id, open]);

  useEffect(() => {
    if (!open || builderStep !== "editor") return;
    window.setTimeout(() => titleRef.current?.focus(), 80);
  }, [builderStep, open]);

  const normalizedStageDefinitions = useMemo(
    () => normalizeTicketStageDefinitions({ stageDefinitions: editorState.stageDrafts }),
    [editorState.stageDrafts],
  );
  const stageOrder = useMemo(
    () => buildTicketStageOrder(normalizedStageDefinitions),
    [normalizedStageDefinitions],
  );
  const hasChooserChanges = aiProfile !== "custom" || aiExtendExisting || aiPrompt.trim().length > 0;
  const hasUnsavedChanges = builderStep === "editor" && serializeEditorState(editorState) !== initialSnapshotRef.current;

  const generateDraft = useMutation({
    mutationFn: () =>
      gtmApi.createCampaignDraft(companyId, {
        draftProfile: aiProfile,
        prompt: aiPrompt.trim(),
        extendExisting: aiExtendExisting,
      }),
    onSuccess: (draft) => {
      const next = mapDraftToEditorState(draft, ceoAgent?.id ?? "");
      setEditorState(next);
      initialSnapshotRef.current = serializeEditorState(next);
      setBuilderStep("editor");
      setAiConfirmOpen(false);
      pushToast({
        title: "CEO draft ready",
        body: "Review the generated campaign workflow, then save when the stages look right.",
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: "CEO draft failed",
        body: error instanceof Error ? error.message : "Failed to generate a GTM campaign draft.",
        tone: "error",
      });
    },
  });

  const createCampaign = useMutation({
    mutationFn: () =>
      ticketsApi.create(companyId, {
        title: editorState.title.trim(),
        description: editorState.description.trim() || undefined,
        instructions: editorState.instructions.trim() || undefined,
        leadAgentId: editorState.leadAgentId || undefined,
        stageDefinitions: normalizedStageDefinitions,
        metadata: {
          ...GTM_METADATA,
          ...buildGtmCampaignMetadata({
            targetAudience: editorState.targetAudience.trim() || null,
            offer: editorState.offer.trim() || null,
            successDefinition: editorState.successDefinition.trim() || null,
            settings: editorState.settings,
          }),
        },
      }),
    onSuccess: async (ticket) => {
      const mergeTicket = (current: Ticket[] | undefined) => {
        const next = current ?? [];
        return [ticket, ...next.filter((entry) => entry.id !== ticket.id)];
      };

      queryClient.setQueryData(queryKeys.tickets.list(companyId), mergeTicket);
      queryClient.setQueryData(["gtm", "tickets", companyId], mergeTicket);
      queryClient.setQueryData(["gtm", "ticket-detail", ticket.id], ticket);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.tickets.list(companyId) }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "tickets", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["gtm", "inbox", companyId] }),
      ]);

      onSuccess?.(ticket);
      onClose();
    },
    onError: (error) => {
      pushToast({
        title: "Campaign creation failed",
        body: error instanceof Error ? error.message : "Failed to create GTM campaign.",
        tone: "error",
      });
    },
  });

  const isBusy = createCampaign.isPending || generateDraft.isPending;

  function updateEditor(patch: Partial<EditorState>) {
    setEditorState((current) => ({ ...current, ...patch }));
  }

  function addStage() {
    setEditorState((current) => ({
      ...current,
      stageDrafts: [
        ...current.stageDrafts.map((stage) => ({ ...stage, expanded: false })),
        createBlankStage(current.stageDrafts.length + 1),
      ],
    }));
  }

  function removeStage(index: number) {
    if (editorState.stageDrafts.length <= 1) return;
    setEditorState((current) => ({
      ...current,
      stageDrafts: current.stageDrafts.filter((_stage, stageIndex) => stageIndex !== index),
    }));
  }

  function moveStage(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= editorState.stageDrafts.length) return;
    setEditorState((current) => {
      const next = [...current.stageDrafts];
      const [stage] = next.splice(index, 1);
      next.splice(nextIndex, 0, stage);
      return {
        ...current,
        stageDrafts: next,
      };
    });
  }

  function requestClose() {
    if (isBusy || hasUnsavedChanges || hasChooserChanges) {
      setCloseConfirmOpen(true);
      return;
    }
    onClose();
  }

  function enterScratchBuilder() {
    const next = createEditorState(ceoAgent?.id ?? "");
    setEditorState(next);
    initialSnapshotRef.current = serializeEditorState(next);
    setBuilderStep("editor");
  }

  function leadAgentLabel(agentId: string): string {
    const agent = agents.find((entry) => entry.id === agentId);
    return agent ? `${agent.name} (${agent.role})` : "No lead agent";
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && requestClose()}>
        <DialogContent
          showCloseButton
          className="max-h-[92vh] overflow-y-auto p-0 gap-0"
          style={{ width: "min(1120px, 92vw)", maxWidth: "92vw" }}
          onEscapeKeyDown={(event) => {
            if (!isBusy && !hasUnsavedChanges && !hasChooserChanges) return;
            event.preventDefault();
            setCloseConfirmOpen(true);
          }}
          onPointerDownOutside={(event) => {
            if (!isBusy && !hasUnsavedChanges && !hasChooserChanges) return;
            event.preventDefault();
            setCloseConfirmOpen(true);
          }}
        >
          {generateDraft.isPending ? <div className="h-1 w-full bg-primary/80" /> : null}

          <DialogHeader className="border-b border-border px-6 pt-6 pb-4">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-4 w-4 text-primary" />
              New GTM Campaign
            </DialogTitle>
            <DialogDescription>
              {builderStep === "chooser"
                ? "Choose how you want to initialize the campaign workflow. Scratch stays blank. AI drafts through the CEO path and then hands you a fully editable campaign."
                : "Build a reusable GTM campaign workflow on top of the canonical ticket pipeline, with user-defined stage contracts and agent handoffs."}
            </DialogDescription>
          </DialogHeader>

          {builderStep === "chooser" ? (
            <div className="px-6 py-8">
              <div className="mx-auto grid max-w-4xl gap-5 lg:grid-cols-2">
                <button
                  ref={scratchCardRef}
                  type="button"
                  className="group rounded-2xl border border-border bg-card p-6 text-left transition-colors hover:border-primary/40 hover:bg-accent/20 focus:outline-none focus:ring-2 focus:ring-ring"
                  onClick={enterScratchBuilder}
                  disabled={isBusy}
                >
                  <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background">
                    <PencilLine className="h-5 w-5 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold">Build From Scratch</h3>
                    <p className="text-sm text-muted-foreground">
                      Start with a blank GTM workflow and define the campaign stages, owners, and handoffs yourself.
                    </p>
                  </div>
                  <div className="mt-6 flex items-center text-sm font-medium text-primary">
                    Open blank campaign builder
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </button>

                <div className="rounded-2xl border border-border bg-card p-6">
                  <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background">
                    <Bot className="h-5 w-5 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold">Build From AI</h3>
                    <p className="text-sm text-muted-foreground">
                      Ask the CEO path to generate a first campaign draft, then review and customize everything before saving.
                    </p>
                  </div>

                  <div className="mt-5 space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Draft focus</Label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                        value={aiProfile}
                        onChange={(event) =>
                          setAiProfile(event.target.value as (typeof AI_DRAFT_PROFILES)[number]["value"])
                        }
                        disabled={isBusy}
                      >
                        {AI_DRAFT_PROFILES.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">CEO prompt</Label>
                      <Textarea
                        value={aiPrompt}
                        onChange={(event) => setAiPrompt(event.target.value)}
                        placeholder="Build a founder-led outbound campaign for seed-stage fintech CFOs."
                        disabled={isBusy}
                        rows={3}
                        className="min-h-[88px] resize-y"
                      />
                    </div>

                    <label className="flex items-start gap-3 rounded-lg border border-border bg-background/40 px-3 py-3">
                      <Checkbox
                        checked={aiExtendExisting}
                        onCheckedChange={(checked) => setAiExtendExisting(Boolean(checked))}
                        disabled={isBusy}
                      />
                      <span className="space-y-1">
                        <span className="block text-sm font-medium">Extend current GTM patterns</span>
                        <span className="block text-xs text-muted-foreground">
                          Ask the CEO path to bias the draft toward the existing GTM campaign posture instead of a net-new structure.
                        </span>
                      </span>
                    </label>
                  </div>

                  <div className="mt-6 flex justify-end">
                    <Button
                      type="button"
                      onClick={() => setAiConfirmOpen(true)}
                      disabled={!aiPrompt.trim() || isBusy}
                      className="gap-2"
                    >
                      {generateDraft.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Send To CEO
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-border px-6 py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline">{stageCountLabel(stageOrder.length)}</Badge>
                  {hasUnsavedChanges ? <Badge variant="outline">Unsaved changes</Badge> : <Badge variant="outline">Ready to save</Badge>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setBuilderStep("chooser")} disabled={isBusy}>
                  Back
                </Button>
              </div>

              <div className="grid gap-6 px-6 py-5 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-6">
                  <section className="space-y-3">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Campaign title</Label>
                      <Input
                        ref={titleRef}
                        value={editorState.title}
                        onChange={(event) => updateEditor({ title: event.target.value })}
                        placeholder="Launch founder-led outbound for ICP A"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Campaign objective</Label>
                      <Textarea
                        value={editorState.description}
                        onChange={(event) => updateEditor({ description: event.target.value })}
                        placeholder="Describe the target outcome, why this campaign exists, and the business context."
                        rows={4}
                      />
                    </div>
                  </section>

                  <section className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Target audience</Label>
                      <Textarea
                        value={editorState.targetAudience}
                        onChange={(event) => updateEditor({ targetAudience: event.target.value })}
                        placeholder="Ideal customer profile, segment, list source, or account constraints."
                        rows={4}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Offer / message</Label>
                      <Textarea
                        value={editorState.offer}
                        onChange={(event) => updateEditor({ offer: event.target.value })}
                        placeholder="Core offer, CTA, angle, assets, and messaging constraints."
                        rows={4}
                      />
                    </div>
                  </section>

                  <section className="space-y-3">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workflow instructions</Label>
                      <Textarea
                        value={editorState.instructions}
                        onChange={(event) => updateEditor({ instructions: event.target.value })}
                        placeholder="Canonical CEO brief, guardrails, approvals, and issue creation expectations for every handoff."
                        rows={5}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Success definition</Label>
                      <Textarea
                        value={editorState.successDefinition}
                        onChange={(event) => updateEditor({ successDefinition: event.target.value })}
                        placeholder="How operators should decide that this campaign flow is complete or needs iteration."
                        rows={3}
                      />
                    </div>
                  </section>

                  <GtmCampaignSettingsCard
                    settings={editorState.settings}
                    onChange={(settings) => updateEditor({ settings })}
                  />
                </div>

                <div className="space-y-6">
                  <GtmStageContractEditor
                    stages={editorState.stageDrafts}
                    currentStage={null}
                    onChange={(stageDrafts) => updateEditor({ stageDrafts })}
                    onAddStage={addStage}
                    onRemoveStage={removeStage}
                    onMoveStage={moveStage}
                  />

                  <section className="space-y-3 rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2">
                      <Settings2 className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold">Lead agent alignment</h3>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      The lead agent remains the canonical fallback for stage issue ownership when a stage does not specify an owner role.
                    </p>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      value={editorState.leadAgentId}
                      onChange={(event) => updateEditor({ leadAgentId: event.target.value })}
                    >
                      <option value="">No lead agent</option>
                      {agents.map((agent: Agent) => (
                        <option key={agent.id} value={agent.id}>
                          {leadAgentLabel(agent.id)}
                        </option>
                      ))}
                    </select>

                    <div className="rounded-md border border-border bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                      This campaign will create a canonical ticket with {stageCountLabel(stageOrder.length)} and preserve backward-compatible `stageOrder` alongside structured `stageDefinitions`.
                    </div>
                  </section>
                </div>
              </div>

              <DialogFooter className="border-t border-border px-6 py-4">
                <Button variant="outline" onClick={requestClose} disabled={createCampaign.isPending}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createCampaign.mutate()}
                  disabled={!editorState.title.trim() || normalizedStageDefinitions.length === 0 || createCampaign.isPending}
                  className={cn("gap-2", createCampaign.isPending && "opacity-80")}
                >
                  {createCampaign.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Create GTM Campaign
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={closeConfirmOpen} onOpenChange={setCloseConfirmOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{isBusy ? "Discard in-flight work?" : "Discard campaign changes?"}</DialogTitle>
            <DialogDescription>
              {isBusy
                ? "The campaign draft or save flow is still running. If you leave now, you will discard the current modal state."
                : "You have unsaved campaign changes. Continue editing to keep them, or discard them and close the modal."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseConfirmOpen(false)}>
              Continue editing
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setCloseConfirmOpen(false);
                onClose();
              }}
            >
              Discard changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={aiConfirmOpen} onOpenChange={setAiConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send this to the CEO path?</DialogTitle>
            <DialogDescription>
              This generates a campaign draft first, then hands you the full GTM campaign editor with the fields pre-populated for review.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-border bg-muted/20 px-3 py-3 text-sm">
            <div className="font-medium">{AI_DRAFT_PROFILES.find((option) => option.value === aiProfile)?.label}</div>
            <div className="mt-1 text-muted-foreground">{aiPrompt.trim()}</div>
            {aiExtendExisting ? (
              <div className="mt-2 text-xs text-muted-foreground">Bias toward extending existing GTM workflow patterns.</div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAiConfirmOpen(false)} disabled={generateDraft.isPending}>
              Cancel
            </Button>
            <Button onClick={() => generateDraft.mutate()} disabled={generateDraft.isPending} className="gap-2">
              {generateDraft.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Confirm and generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
