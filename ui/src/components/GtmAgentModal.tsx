import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { AgentConfigForm, type CreateConfigValues } from "@/components/AgentConfigForm";
import { OpenCodeLogoIcon } from "@/components/OpenCodeLogoIcon";
import { defaultCreateValues } from "@/components/agent-config-defaults";
import { agentsApi } from "@/api/agents";
import { gtmApi } from "@/api/gtm";
import { getUIAdapter } from "@/adapters";
import { useDialog } from "@/context/DialogContext";
import { useToast } from "@/context/ToastContext";
import { queryKeys } from "@/lib/queryKeys";
import {
  DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX,
  DEFAULT_CODEX_LOCAL_MODEL,
} from "@paperclipai/adapter-codex-local";
import { DEFAULT_CURSOR_LOCAL_MODEL } from "@paperclipai/adapter-cursor-local";
import { DEFAULT_GEMINI_LOCAL_MODEL } from "@paperclipai/adapter-gemini-local";
import type { Agent } from "@paperclipai/shared";
import {
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  ChevronDown,
  Code,
  Gem,
  MousePointer2,
  PencilLine,
  Sparkles,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";

type GtmAgentModalProps = {
  open: boolean;
  onClose: () => void;
  companyId: string;
  onSuccess?: (agent: Agent) => void;
};

type SupportedAdapterType = CreateConfigValues["adapterType"];

type BuilderStep = "chooser" | "editor";

const AI_DRAFT_PROFILES = [
  { value: "custom", label: "Custom agent" },
  { value: "sdr", label: "SDR / Outbound" },
  { value: "research", label: "Research analyst" },
  { value: "ops", label: "GTM operations" },
  { value: "content", label: "Content & copy" },
] as const;

const PRIMARY_ADAPTER_OPTIONS: Array<{
  value: SupportedAdapterType;
  label: string;
  desc: string;
  icon: ComponentType<{ className?: string }>;
  recommended?: boolean;
}> = [
  {
    value: "claude_local",
    label: "Claude Code",
    icon: Sparkles,
    desc: "Local Claude agent",
    recommended: true,
  },
  {
    value: "codex_local",
    label: "Codex",
    icon: Code,
    desc: "Local Codex agent",
    recommended: true,
  },
];

const SECONDARY_ADAPTER_OPTIONS: Array<{
  value: SupportedAdapterType;
  label: string;
  desc: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  {
    value: "gemini_local",
    label: "Gemini CLI",
    icon: Gem,
    desc: "Local Gemini agent",
  },
  {
    value: "opencode_local",
    label: "OpenCode",
    icon: OpenCodeLogoIcon,
    desc: "Local multi-provider agent",
  },
  {
    value: "pi_local",
    label: "Pi",
    icon: Terminal,
    desc: "Local Pi agent",
  },
  {
    value: "cursor",
    label: "Cursor",
    icon: MousePointer2,
    desc: "Local Cursor agent",
  },
  {
    value: "openclaw_gateway",
    label: "OpenClaw Gateway",
    icon: Bot,
    desc: "Invoke OpenClaw via gateway protocol",
  },
];

function createValuesForAdapterType(adapterType: SupportedAdapterType): CreateConfigValues {
  const { adapterType: _discard, ...defaults } = defaultCreateValues;
  const nextValues: CreateConfigValues = {
    ...defaults,
    adapterType,
    heartbeatEnabled: true,
    intervalSec: 3600,
  };

  if (adapterType === "codex_local") {
    nextValues.model = DEFAULT_CODEX_LOCAL_MODEL;
    nextValues.dangerouslyBypassSandbox = DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX;
  } else if (adapterType === "gemini_local") {
    nextValues.model = DEFAULT_GEMINI_LOCAL_MODEL;
  } else if (adapterType === "cursor") {
    nextValues.model = DEFAULT_CURSOR_LOCAL_MODEL;
  } else if (adapterType === "opencode_local") {
    nextValues.model = "";
  }

  return nextValues;
}

export function GtmAgentModal({ open, onClose, companyId, onSuccess }: GtmAgentModalProps) {
  const { pushToast } = useToast();
  const { openNewIssue } = useDialog();
  const queryClient = useQueryClient();
  const nameRef = useRef<HTMLInputElement>(null);
  const scratchCardRef = useRef<HTMLButtonElement>(null);

  const [builderStep, setBuilderStep] = useState<BuilderStep>("chooser");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [showMoreAdapters, setShowMoreAdapters] = useState(false);
  const [configValues, setConfigValues] = useState<CreateConfigValues>(() => createValuesForAdapterType("codex_local"));
  const [formError, setFormError] = useState<string | null>(null);

  const [aiProfile, setAiProfile] = useState<(typeof AI_DRAFT_PROFILES)[number]["value"]>("custom");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiExtendExisting, setAiExtendExisting] = useState(false);
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(new Set());

  const { data: skillsData } = useQuery({
    queryKey: queryKeys.skills.list(companyId),
    queryFn: () => agentsApi.listSkills(companyId),
    enabled: open && Boolean(companyId),
  });
  const workspaceSkills = skillsData?.skills ?? [];

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
    setBuilderStep("chooser");
    setName("");
    setTitle("");
    setShowMoreAdapters(false);
    setConfigValues(createValuesForAdapterType("codex_local"));
    setFormError(null);
    setAiProfile("custom");
    setAiPrompt("");
    setAiExtendExisting(false);
    setSelectedSkillIds(new Set());
    window.setTimeout(() => scratchCardRef.current?.focus(), 80);
  }, [open]);

  useEffect(() => {
    if (!open || builderStep !== "editor") return;
    window.setTimeout(() => nameRef.current?.focus(), 80);
  }, [builderStep, open]);

  const currentAdapter = useMemo(() => getUIAdapter(configValues.adapterType), [configValues.adapterType]);

  const createAgent = useMutation({
    mutationFn: async () => {
      if (!name.trim()) {
        throw new Error("Agent name is required.");
      }
      if (configValues.adapterType === "opencode_local" && !configValues.model.trim()) {
        throw new Error("OpenCode requires an explicit model in provider/model format.");
      }

      return gtmApi.createAgent(companyId, {
        name: name.trim(),
        role: "general",
        title: title.trim() || null,
        adapterType: configValues.adapterType,
        adapterConfig: currentAdapter.buildAdapterConfig(configValues),
        runtimeConfig: {
          heartbeat: {
            enabled: configValues.heartbeatEnabled,
            intervalSec: configValues.intervalSec,
            wakeOnDemand: true,
            cooldownSec: 10,
            maxConcurrentRuns: 1,
          },
        },
      });
    },
    onSuccess: async (agent) => {
      // Assign selected skills to the newly created agent
      for (const skillId of selectedSkillIds) {
        try {
          await agentsApi.addAgentSkill(agent.id, skillId);
        } catch { /* best-effort — agent is already created */ }
      }
      await queryClient.invalidateQueries({ queryKey: ["gtm", "agents", companyId] });
      onSuccess?.(agent);
      pushToast({
        title: "Agent created",
        body: "The GTM agent is ready for assignment.",
        tone: "success",
      });
      onClose();
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to create agent";
      setFormError(message);
      pushToast({
        title: "Agent creation failed",
        body: message,
        tone: "error",
      });
    },
  });

  function handleSendToCeo() {
    const profileLabel = AI_DRAFT_PROFILES.find((p) => p.value === aiProfile)?.label ?? aiProfile;
    const prompt = aiPrompt.trim();

    const lines: string[] = [
      "## GTM Agent Creation Request",
      "",
      "This issue was generated by the GTM Agent Creation modal.",
      "Use the paperclip-create-agent skill to fulfill this request.",
      "",
      "### Parameters",
      "",
      `- **Action:** Create a new GTM agent (hire via agent-hires API)`,
      `- **Draft focus:** ${profileLabel}`,
      `- **Surface profile:** gtm`,
    ];

    if (prompt) {
      lines.push("", "### Operator Prompt", "", prompt);
    }

    if (aiExtendExisting) {
      lines.push(
        "",
        "### Constraints",
        "",
        "Extend current GTM patterns — bias toward the existing GTM agent posture, reuse proven adapter config from sibling agents, and align reporting line within the current GTM org structure instead of creating a net-new structure.",
      );
    }

    onClose();
    openNewIssue({
      assigneeAgentId: ceoAgent?.id,
      title: `[GTM Agent Creation] ${profileLabel}${prompt ? `: ${prompt.slice(0, 80)}` : ""}`,
      description: lines.join("\n"),
    });
  }

  function renderAdapterCard(option: {
    value: SupportedAdapterType;
    label: string;
    desc: string;
    icon: ComponentType<{ className?: string }>;
    recommended?: boolean;
  }) {
    const Icon = option.icon;
    return (
      <button
        key={option.value}
        type="button"
        className={cn(
          "relative flex flex-col items-center gap-1.5 rounded-md border p-3 text-xs transition-colors",
          configValues.adapterType === option.value
            ? "border-foreground bg-accent"
            : "border-border hover:bg-accent/50",
        )}
        onClick={() => {
          setConfigValues(createValuesForAdapterType(option.value));
          setFormError(null);
        }}
      >
        {option.recommended ? (
          <span className="absolute -top-1.5 right-1.5 rounded-full bg-green-500 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-white">
            Recommended
          </span>
        ) : null}
        <Icon className="h-4 w-4" />
        <span className="font-medium">{option.label}</span>
        <span className="text-[10px] text-muted-foreground">{option.desc}</span>
      </button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        className="max-h-[92vh] overflow-y-auto p-0 gap-0"
        style={{ width: "min(980px, 92vw)", maxWidth: "92vw" }}
      >
        <DialogHeader className="border-b border-border px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-4 w-4 text-primary" />
            New GTM Agent
          </DialogTitle>
          <DialogDescription>
            {builderStep === "chooser"
              ? "Choose how you want to create the agent. Build from scratch configures adapter and runtime directly. AI delegates to the CEO path to draft the agent for you."
              : "Configure the GTM agent adapter and runtime settings, then create."}
          </DialogDescription>
        </DialogHeader>

        {builderStep === "chooser" ? (
          <div className="px-6 py-8">
            <div className="mx-auto grid max-w-4xl gap-5 lg:grid-cols-2">
              <button
                ref={scratchCardRef}
                type="button"
                className="group rounded-2xl border border-border bg-card p-6 text-left transition-colors hover:border-primary/40 hover:bg-accent/20 focus:outline-none focus:ring-2 focus:ring-ring"
                onClick={() => setBuilderStep("editor")}
              >
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background">
                  <PencilLine className="h-5 w-5 text-primary" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">Build From Scratch</h3>
                  <p className="text-sm text-muted-foreground">
                    Start with a blank agent configuration and choose the adapter type, runtime settings, and identity yourself.
                  </p>
                </div>
                <div className="mt-6 flex items-center text-sm font-medium text-primary">
                  Open blank campaign builder
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>

              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background">
                  <BriefcaseBusiness className="h-5 w-5 text-primary" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">Build From AI</h3>
                  <p className="text-sm text-muted-foreground">
                    Ask the CEO path to draft the agent configuration, then review the result in the inbox.
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
                      placeholder="Create an SDR browser agent that handles outbound prospecting and lead qualification."
                      rows={3}
                      className="min-h-[88px] resize-y"
                    />
                  </div>

                  <label className="flex items-start gap-3 rounded-lg border border-border bg-background/40 px-3 py-3">
                    <Checkbox
                      checked={aiExtendExisting}
                      onCheckedChange={(checked) => setAiExtendExisting(Boolean(checked))}
                    />
                    <span className="space-y-1">
                      <span className="block text-sm font-medium">Extend current GTM patterns</span>
                      <span className="block text-xs text-muted-foreground">
                        Ask the CEO path to bias the agent draft toward the existing GTM agent posture instead of a net-new structure.
                      </span>
                    </span>
                  </label>
                </div>

                <div className="mt-6 flex justify-end">
                  <Button
                    type="button"
                    onClick={handleSendToCeo}
                    disabled={!aiPrompt.trim()}
                    className="gap-2"
                  >
                    <BriefcaseBusiness className="h-4 w-4" />
                    Send To CEO
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-border px-6 py-3">
              <span className="text-sm text-muted-foreground">Manual agent configuration</span>
              <Button variant="ghost" size="sm" onClick={() => setBuilderStep("chooser")}>
                Back
              </Button>
            </div>

            <div className="space-y-6 px-6 py-5">
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Agent name</label>
                    <Input
                      ref={nameRef}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="SDR Browser Agent"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Title</label>
                    <Input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Outbound automation"
                    />
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                  <div>
                    <h3 className="text-sm font-semibold">Choose how this agent runs</h3>
                    <p className="text-xs text-muted-foreground">
                      Use the same adapter-selection pattern as onboarding, then tune the full config below.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {PRIMARY_ADAPTER_OPTIONS.map(renderAdapterCard)}
                  </div>

                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setShowMoreAdapters((current) => !current)}
                  >
                    <ChevronDown
                      className={cn(
                        "h-3 w-3 transition-transform",
                        showMoreAdapters ? "rotate-0" : "-rotate-90",
                      )}
                    />
                    More Agent Adapter Types
                  </button>

                  {showMoreAdapters ? (
                    <div className="grid grid-cols-2 gap-2">
                      {SECONDARY_ADAPTER_OPTIONS.map(renderAdapterCard)}
                    </div>
                  ) : null}
                </div>

                <AgentConfigForm
                  mode="create"
                  values={configValues}
                  onChange={(patch) => {
                    setConfigValues((current) => ({ ...current, ...patch }));
                    setFormError(null);
                  }}
                  sectionLayout="cards"
                />

                {/* Skills selection */}
                {workspaceSkills.length > 0 && (
                  <div className="rounded-lg border border-border p-4 space-y-2">
                    <h3 className="text-sm font-medium">Skills</h3>
                    <p className="text-xs text-muted-foreground">
                      Assign reusable instruction bundles to this agent.
                    </p>
                    <div className="space-y-1.5">
                      {workspaceSkills.map((skill) => (
                        <label
                          key={skill.id}
                          className="flex items-center gap-2 rounded-md border border-border bg-muted/10 px-3 py-2 cursor-pointer hover:bg-muted/20"
                        >
                          <Checkbox
                            checked={selectedSkillIds.has(skill.id)}
                            onCheckedChange={(checked) => {
                              setSelectedSkillIds((prev) => {
                                const next = new Set(prev);
                                if (checked) next.add(skill.id);
                                else next.delete(skill.id);
                                return next;
                              });
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <span className="font-mono text-sm">{skill.name}</span>
                            {skill.description && (
                              <p className="text-xs text-muted-foreground truncate">{skill.description}</p>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {formError ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {formError}
                  </div>
                ) : null}
              </div>
            </div>

            <DialogFooter className="border-t border-border px-6 py-4">
              <Button variant="outline" onClick={onClose} disabled={createAgent.isPending}>
                Cancel
              </Button>
              <Button onClick={() => createAgent.mutate()} disabled={!name.trim() || createAgent.isPending}>
                {createAgent.isPending ? "Creating..." : "Create Agent"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
