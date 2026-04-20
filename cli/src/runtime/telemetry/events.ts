/**
 * Canonical event taxonomy for the Growthub Local activation funnel.
 *
 * Kept deliberately thin. The funnel tracked here is:
 *
 *   Acquisition → Activation → Expansion → Retention → Friction
 *
 * Lead capture is NOT part of this taxonomy — email capture happens on
 * the hosted app side when `growthub_auth_connected` fires. The CLI's
 * only responsibility is bridging the operator to the hosted activation
 * link (the first-month $1 offer), which is tracked via
 * `hosted_activation_clicked`.
 *
 * See: docs/POSTHOG_OBSERVABILITY.md
 */

export type TelemetryEventName =
  // Acquisition
  | "cli_installed"
  | "cli_first_run"
  | "discover_opened"
  // Activation — first value paths
  | "starter_import_repo_started"
  | "starter_import_repo_completed"
  | "starter_import_skill_started"
  | "starter_import_skill_completed"
  | "workspace_starter_created"
  | "kit_download_completed"
  // Expansion — governance / depth
  | "fork_registered"
  | "fork_sync_preview_started"
  | "fork_sync_heal_applied"
  | "growthub_auth_connected"
  | "hosted_activation_clicked"
  // Friction
  | "first_run_failed"
  | "import_failed"
  | "auth_required_encountered"
  | "awaiting_confirmation_reached"
  | "setup_health_failed";

/**
 * Closed property allowlist.
 *
 * The capture client will drop any property not in this set so raw
 * source code, prompt contents, secrets, repo contents, env vars,
 * authority envelope contents, or artifact payloads can never be sent
 * by accident.
 */
export const ALLOWED_PROPERTY_KEYS: readonly string[] = Object.freeze([
  // Coarse path metadata
  "surface",
  "path",
  "source_kind",
  "import_mode",
  "kit_family",
  "kit_id_hash",
  "starter_kit_id",
  "remote_sync_mode",
  "fork_id_hash",
  "drift_severity",
  "heal_action_count",
  // Outcomes
  "outcome",
  "duration_ms",
  "error_code",
  // Funnel linkage
  "funnel_stage",
  // Session/machine (anonymized)
  "cli_version",
  "installer_mode",
  "node_major",
  "os",
  // Hosted — only populated after explicit `growthub auth login`
  "hosted_user_id",
  "hosted_org_id",
  // CTA target (activation bridge)
  "cta_target",
  "cta_label",
]);

export type TelemetryOutcome = "success" | "failure" | "cancelled" | "skipped";
