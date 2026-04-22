/**
 * Environment Snapshot — Renderers
 *
 * Pure functions turning an `EnvironmentSnapshot` into the three panels
 * shown inside the Environment Management lane: Local, Hosted, Bridge.
 */

import pc from "picocolors";
import type {
  BridgeSnapshot,
  EnvironmentSnapshot,
  HostedSnapshot,
  LocalForkSnapshot,
  LocalSnapshot,
} from "./types.js";

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*m/g, "");
}

function box(lines: string[]): string {
  const padded = lines.map((l) => "  " + l);
  const width = Math.max(...padded.map((l) => stripAnsi(l).length)) + 4;
  const top = pc.dim("┌" + "─".repeat(width) + "┐");
  const bottom = pc.dim("└" + "─".repeat(width) + "┘");
  const body = padded.map((l) => {
    const pad = width - stripAnsi(l).length;
    return pc.dim("│") + l + " ".repeat(pad) + pc.dim("│");
  });
  return [top, ...body, bottom].join("\n");
}

function badge(text: string, color: (s: string) => string): string {
  return color(`[${text}]`);
}

function renderLocalForkLine(fork: LocalForkSnapshot): string {
  const id = fork.forkId ? pc.bold(fork.forkId) : pc.dim("(unregistered)");
  const kit = fork.kitId ? pc.dim(`kit:${fork.kitId}`) : "";
  const label = fork.label ? pc.cyan(`"${fork.label}"`) : "";
  const policy = fork.policyPresent ? pc.green("policy") : pc.dim("no-policy");
  const authority = fork.authorityPresent ? pc.magenta("authority") : pc.dim("no-authority");
  const ext = fork.localExtensionCount > 0 ? pc.yellow(`${fork.localExtensionCount} ext`) : pc.dim("0 ext");
  return `  ${id} ${kit} ${label}  ${policy} · ${authority} · ${ext}`;
}

export function renderLocalPanel(local: LocalSnapshot): string {
  const lines: string[] = [
    pc.bold("Local Fork State"),
    "",
    `${pc.dim("Registered forks:")}   ${local.registeredForks.length}`,
    `${pc.dim("Active fork (cwd):")}  ${
      local.activeFork
        ? pc.green(local.activeFork.forkId ?? local.activeFork.forkPath)
        : pc.dim("(cwd is not a fork)")
    }`,
    `${pc.dim("Local extensions:")}   ${local.totalLocalExtensions}`,
  ];

  if (local.registeredForks.length > 0) {
    lines.push("");
    for (const fork of local.registeredForks.slice(0, 10)) {
      lines.push(renderLocalForkLine(fork));
    }
    if (local.registeredForks.length > 10) {
      lines.push(pc.dim(`  … and ${local.registeredForks.length - 10} more`));
    }
  }

  return box(lines);
}

export function renderHostedPanel(hosted: HostedSnapshot): string {
  const status = hosted.connected
    ? badge("connected", pc.green)
    : badge(hosted.sessionExpired ? "expired" : "offline", pc.red);

  const lines: string[] = [
    `${pc.bold("Hosted Account")}  ${status}`,
    "",
  ];

  if (hosted.baseUrl) lines.push(`${pc.dim("Base URL:")}       ${hosted.baseUrl}`);
  if (hosted.machineLabel) lines.push(`${pc.dim("Machine:")}        ${hosted.machineLabel}`);
  if (hosted.workspaceLabel) lines.push(`${pc.dim("Workspace:")}      ${hosted.workspaceLabel}`);

  if (hosted.profile) {
    lines.push(
      "",
      `${pc.dim("User:")}           ${hosted.profile.displayName ?? hosted.profile.email ?? hosted.profile.userId}`,
      `${pc.dim("Org:")}            ${hosted.profile.orgName ?? hosted.profile.orgId ?? pc.dim("(none)")}`,
      `${pc.dim("Entitlements:")}   ${
        hosted.profile.entitlements.length > 0
          ? hosted.profile.entitlements.join(", ")
          : pc.dim("(none)")
      }`,
      `${pc.dim("Gated kits:")}     ${
        hosted.profile.gatedKitSlugs.length > 0
          ? hosted.profile.gatedKitSlugs.join(", ")
          : pc.dim("(none)")
      }`,
      `${pc.dim("Default mode:")}   ${hosted.profile.executionDefaults.preferredMode}`,
    );
  }

  if (hosted.registry) {
    lines.push(
      "",
      `${pc.dim("Registry:")}       ${hosted.registry.total} nodes  ·  ${hosted.registry.enabledCount} enabled`,
      `${pc.dim("Source:")}         ${hosted.registry.source}${hosted.registry.cached ? pc.yellow(" (cached)") : ""}`,
      ...(hosted.registry.manifestHash ? [`${pc.dim("Manifest hash:")}  ${hosted.registry.manifestHash}`] : []),
    );
  }

  if (hosted.reason) {
    lines.push("", pc.yellow(hosted.reason));
  }

  return box(lines);
}

export function renderBridgePanel(bridge: BridgeSnapshot): string {
  const stateColor: Record<BridgeSnapshot["state"], (s: string) => string> = {
    ready: pc.green,
    offline: pc.yellow,
    "needs-auth": pc.red,
    "needs-refresh": pc.yellow,
  };
  const lines: string[] = [
    `${pc.bold("Bridge Health")}  ${badge(bridge.state, stateColor[bridge.state])}`,
    "",
    `${pc.dim("Session token:")}  ${bridge.sessionTokenPresent ? pc.green("present") : pc.red("missing")}`,
    `${pc.dim("Session valid:")}  ${bridge.sessionTokenPresent ? (bridge.sessionExpired ? pc.red("expired") : pc.green("valid")) : pc.dim("—")}`,
    `${pc.dim("Cache fresh:")}    ${bridge.cacheFresh ? pc.green("yes") : pc.red("no")}`,
  ];
  if (bridge.cacheHash) lines.push(`${pc.dim("Cache hash:")}     ${bridge.cacheHash}`);
  if (bridge.remoteHash) lines.push(`${pc.dim("Remote hash:")}    ${bridge.remoteHash}`);
  if (bridge.drift) {
    const driftColor =
      bridge.drift.severity === "none" ? pc.green
      : bridge.drift.severity === "node-added" ? pc.yellow
      : pc.red;
    lines.push(`${pc.dim("Drift:")}          ${driftColor(bridge.drift.severity)}`);
    if (bridge.drift.addedSlugs.length)   lines.push(`${pc.dim("  +")}  ${bridge.drift.addedSlugs.join(", ")}`);
    if (bridge.drift.removedSlugs.length) lines.push(`${pc.dim("  -")}  ${bridge.drift.removedSlugs.join(", ")}`);
    if (bridge.drift.mutatedSlugs.length) lines.push(`${pc.dim("  ~")}  ${bridge.drift.mutatedSlugs.join(", ")}`);
  }
  if (bridge.notes.length > 0) {
    lines.push("");
    for (const note of bridge.notes) lines.push(pc.yellow(note));
  }
  return box(lines);
}

export function renderEnvironmentSnapshot(snapshot: EnvironmentSnapshot): string {
  return [
    renderLocalPanel(snapshot.local),
    renderHostedPanel(snapshot.hosted),
    renderBridgePanel(snapshot.bridge),
    pc.dim(`Generated: ${snapshot.generatedAt}`),
  ].join("\n\n");
}
