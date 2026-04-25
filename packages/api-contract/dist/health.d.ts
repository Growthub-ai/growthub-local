/**
 * @growthub/api-contract — Kit Health (CMS SDK v1)
 *
 * Public, type-only surface for kit health reports and maturity scoring.
 *
 * Lets the CLI, agents, and hosted surfaces agree on what "ready" means
 * for a Growthub worker kit without each surface reinventing its own
 * readiness format.
 *
 * The reference implementations are
 * `cli/assets/worker-kits/growthub-creative-video-pipeline-v1/helpers/check-pipeline-health.sh`
 * and `scripts/score-worker-kits.mjs`. Both already emit JSON shapes
 * compatible with this surface.
 *
 * Rules:
 *   - Additive only. Existing health helpers (e.g. `setup/verify-env.mjs`,
 *     `helpers/check-generative-adapter.sh`) stay valid; this surface
 *     standardizes their report shape.
 *   - No runtime behavior. The SDK describes; the kit and CLI compute.
 *   - Health does not decide deployment policy. Consumers (e.g. CI
 *     gates, hosted activation) make that decision from the report.
 */
/**
 * Severity of a health check failure. Maps to typical CLI exit-code
 * semantics:
 *
 *   - `pass`  — no action needed
 *   - `info`  — diagnostic only
 *   - `warn`  — action recommended; not blocking
 *   - `fail`  — action required; blocks downstream stages
 */
export type KitHealthSeverity = "pass" | "info" | "warn" | "fail";
/**
 * One health check result. A kit health report aggregates many of these.
 */
export interface KitHealthCheck {
    /** Stable check identifier (e.g. `verify-env`, `video-use-home`). */
    id: string;
    /** Short human label. */
    label?: string;
    /** Severity outcome. */
    severity: KitHealthSeverity;
    /** Human-readable detail (only present when severity > `pass`). */
    message?: string;
    /**
     * Optional remediation hint — a command or doc pointer the operator
     * can act on (e.g. `bash setup/clone-fork.sh`).
     */
    remediation?: string;
    /** Optional category tag (e.g. `env`, `adapter`, `dependency`, `topology`). */
    category?: string;
    /** Optional stage id this check applies to. */
    stageId?: string;
    /** Free-form structured evidence the consumer may inspect. */
    evidence?: Record<string, unknown>;
}
/**
 * Aggregated health for a single kit at a single point in time.
 */
export interface KitHealthReport {
    /** Report schema version. Matches `KIT_HEALTH_REPORT_VERSION`. */
    version: number;
    /** Kit identifier. */
    kitId: string;
    /** ISO-8601 UTC timestamp when the report was produced. */
    generatedAt: string;
    /** Overall severity (worst of all `checks[]`). */
    overall: KitHealthSeverity;
    /** Individual checks. */
    checks: KitHealthCheck[];
    /**
     * Optional convention envelope mirroring the manifest envelopes; lets
     * a reader confirm which spec the report conforms to.
     */
    convention?: {
        spec?: string;
        version?: number;
        runtimeEnforcement?: "none" | "warn" | "error";
    };
}
/**
 * One scoring dimension. Mirrors the shape emitted by
 * `scripts/score-worker-kits.mjs --json`.
 */
export interface KitMaturityDimension {
    /** Stable dimension identifier (e.g. `pipeline-manifest`). */
    id: string;
    /** Short human label. */
    label?: string;
    /** Whether the dimension applies to this kit (some are pipeline-only). */
    applies: boolean;
    /** Whether the dimension passed. */
    pass: boolean;
    /** Optional structured evidence. */
    evidence?: Record<string, unknown>;
}
/**
 * Maturity score for a single kit. Aggregates the dimensions listed in
 * `docs/PIPELINE_KIT_CONTRACT_V1.md` and the six governed-workspace
 * primitives.
 *
 * `score` is `passed / applicable` (0..1). Dimensions where
 * `applies = false` do not affect the score.
 */
export interface KitMaturityScore {
    /** Kit identifier. */
    kitId: string;
    /** Family bucket from `kit.json#kit.family` (e.g. `studio`, `operator`). */
    family?: string;
    /** Whether this kit qualifies as a complex / pipeline kit. */
    isComplexKit?: boolean;
    /** Number of applicable dimensions that passed. */
    passed: number;
    /** Number of applicable dimensions. */
    applicable: number;
    /** Aggregate score in `[0, 1]`. */
    score: number;
    /** Per-dimension breakdown. */
    dimensions: KitMaturityDimension[];
}
/**
 * Sentinel for `KitHealthReport.version`. Additive changes keep this
 * literal `1`.
 */
export declare const KIT_HEALTH_REPORT_VERSION: 1;
//# sourceMappingURL=health.d.ts.map