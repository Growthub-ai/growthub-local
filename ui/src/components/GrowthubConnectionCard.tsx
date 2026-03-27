import { Activity, ExternalLink, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type GrowthubConnectionCardProps = {
  description: string;
  connected: boolean;
  baseUrl: string;
  callbackUrl: string;
  portalBaseUrl?: string;
  machineLabel?: string;
  workspaceLabel?: string;
  onOpenConfiguration: () => void;
  onRefresh: () => void;
  onPulseConnection?: () => void;
  onDisconnect?: () => void;
  pulsePending?: boolean;
  disconnectPending?: boolean;
  openDisabled?: boolean;
};

export function GrowthubConnectionCard({
  description,
  connected,
  baseUrl,
  callbackUrl,
  portalBaseUrl,
  machineLabel,
  workspaceLabel,
  onOpenConfiguration,
  onRefresh,
  onPulseConnection,
  onDisconnect,
  pulsePending = false,
  disconnectPending = false,
  openDisabled = false,
}: GrowthubConnectionCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Growthub Connection</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Status</p>
          <p className="mt-1">{connected ? "Connected" : "Needs attention"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Base URL</p>
          <p className="mt-1 break-all">{baseUrl}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Callback URL</p>
          <p className="mt-1 break-all">{callbackUrl}</p>
        </div>
        {portalBaseUrl ? (
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Portal URL</p>
            <p className="mt-1 break-all">{portalBaseUrl}</p>
          </div>
        ) : null}
        {machineLabel ? (
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Machine Label</p>
            <p className="mt-1">{machineLabel}</p>
          </div>
        ) : null}
        {workspaceLabel ? (
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Workspace Label</p>
            <p className="mt-1">{workspaceLabel}</p>
          </div>
        ) : null}
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={onOpenConfiguration} disabled={openDisabled}>
            <ExternalLink className="mr-2 h-4 w-4" />
            Open Configuration
          </Button>
          <Button size="sm" variant="outline" onClick={onRefresh}>
            Refresh
          </Button>
          {connected && onPulseConnection ? (
            <Button size="sm" variant="outline" onClick={onPulseConnection} disabled={pulsePending}>
              <Activity className={`mr-2 h-4 w-4 ${pulsePending ? "animate-pulse" : ""}`} />
              Pulse
            </Button>
          ) : null}
          {connected && onDisconnect ? (
            <Button size="sm" variant="outline" onClick={onDisconnect} disabled={disconnectPending}>
              <Unplug className="mr-2 h-4 w-4" />
              Disconnect
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
