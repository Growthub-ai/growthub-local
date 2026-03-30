import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { AgentConfigForm, type CreateConfigValues } from "@/components/AgentConfigForm";
import { OpenCodeLogoIcon } from "@/components/OpenCodeLogoIcon";
import { defaultCreateValues } from "@/components/agent-config-defaults";
import { gtmApi } from "@/api/gtm";
import { getUIAdapter } from "@/adapters";
import { useToast } from "@/context/ToastContext";
import {
  DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX,
  DEFAULT_CODEX_LOCAL_MODEL,
} from "@paperclipai/adapter-codex-local";
import { DEFAULT_CURSOR_LOCAL_MODEL } from "@paperclipai/adapter-cursor-local";
import { DEFAULT_GEMINI_LOCAL_MODEL } from "@paperclipai/adapter-gemini-local";
import type { Agent } from "@paperclipai/shared";
import {
  Bot,
  ChevronDown,
  Code,
  Gem,
  MousePointer2,
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
  const queryClient = useQueryClient();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [showMoreAdapters, setShowMoreAdapters] = useState(false);
  const [configValues, setConfigValues] = useState<CreateConfigValues>(() => createValuesForAdapterType("codex_local"));
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setTitle("");
    setShowMoreAdapters(false);
    setConfigValues(createValuesForAdapterType("codex_local"));
    setFormError(null);
    window.setTimeout(() => nameRef.current?.focus(), 80);
  }, [open]);

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
          <DialogTitle>Create GTM agent</DialogTitle>
          <DialogDescription>
            Create a GTM agent with the same real adapter and runtime configuration flow used in onboarding, without bouncing into the DX shell.
          </DialogDescription>
        </DialogHeader>

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
      </DialogContent>
    </Dialog>
  );
}
