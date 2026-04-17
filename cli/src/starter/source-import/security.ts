/**
 * Source Import Agent — shared security inspector.
 *
 * Deterministic, bounded, read-only static analysis over a materialised
 * source payload (cloned repo or unpacked skill). The inspector NEVER
 * executes any script. It emits a `SourceSecurityReport` that:
 *
 *   - lists pattern-based findings (shell scripts, install hooks,
 *     external downloads, prompt-injection patterns, env mutation,
 *     privileged instructions, suspicious archives)
 *   - aggregates a risk class (`safe` | `caution` | `high-risk` | `blocked`)
 *   - produces short operator-facing summary lines rendered in the
 *     confirmation prompt
 *
 * Two risk surfaces the caller uses downstream:
 *
 *   - `report.blocked` → agent MUST refuse to continue even on confirm.
 *   - `report.riskClass !== "safe"` → plan flags the inspect action as
 *     needing explicit confirmation.
 *
 * Skills imports ALWAYS require the inspection + confirmation, even when
 * the report is "safe", because skills are agent primitives closer to
 * executable content than generic repos.
 */

import fs from "node:fs";
import path from "node:path";
import type {
  SecurityFinding,
  SecurityFindingCategory,
  SourceRiskClass,
  SourceSecurityReport,
} from "./types.js";

// ---------------------------------------------------------------------------
// Bounds — keep the inspector deterministic and cheap
// ---------------------------------------------------------------------------

const MAX_FILES = 2000;
const MAX_BYTES_PER_FILE = 256 * 1024; // 256 KiB
const MAX_TOTAL_BYTES = 16 * 1024 * 1024; // 16 MiB

const TEXT_EXTENSIONS = new Set([
  ".md", ".mdx", ".markdown",
  ".txt", ".json", ".yaml", ".yml", ".toml",
  ".sh", ".bash", ".zsh", ".fish", ".ps1", ".bat", ".cmd",
  ".py", ".rb", ".js", ".cjs", ".mjs", ".ts", ".tsx", ".jsx",
  ".go", ".rs", ".java", ".kt", ".swift", ".c", ".cc", ".cpp", ".h", ".hpp",
  ".html", ".htm", ".css", ".scss", ".sass", ".less",
  ".xml", ".csv", ".ini", ".env", ".conf", ".cfg",
  ".lock", ".gitignore", ".gitattributes",
  ".dockerfile",
]);

const SUSPICIOUS_BINARY_EXTENSIONS = new Set([
  ".exe", ".dll", ".so", ".dylib",
  ".bin", ".app", ".msi",
  ".apk", ".ipa",
  ".jar", ".war",
  ".dmg", ".pkg",
]);

const ARCHIVE_EXTENSIONS = new Set([
  ".zip", ".tar", ".tgz", ".tar.gz", ".bz2", ".xz", ".7z", ".rar", ".gz",
]);

// ---------------------------------------------------------------------------
// Pattern matchers (text content)
// ---------------------------------------------------------------------------

interface PatternMatcher {
  category: SecurityFindingCategory;
  severity: SecurityFinding["severity"];
  regex: RegExp;
  message: string;
}

const TEXT_PATTERNS: PatternMatcher[] = [
  {
    category: "external-download",
    severity: "high-risk",
    regex: /\bcurl\s+[^|\n]*\|\s*(sudo\s+)?(sh|bash|zsh|ksh|fish)\b/i,
    message: "Pipes remote content directly into a shell interpreter.",
  },
  {
    category: "external-download",
    severity: "high-risk",
    regex: /\bwget\s+[^|\n]*\|\s*(sudo\s+)?(sh|bash|zsh|ksh|fish)\b/i,
    message: "Pipes a wget download directly into a shell interpreter.",
  },
  {
    category: "privileged-instruction",
    severity: "high-risk",
    regex: /\bsudo\s+rm\s+-rf?\s+\/(?!home|Users|tmp)/i,
    message: "Invokes sudo rm -rf on a root-adjacent path.",
  },
  {
    category: "privileged-instruction",
    severity: "blocking",
    regex: /\brm\s+-rf\s+\/(?:\s|$)/i,
    message: "Attempts to recursively delete the filesystem root.",
  },
  {
    category: "privileged-instruction",
    severity: "caution",
    regex: /\bchmod\s+\+s\b/i,
    message: "Sets the setuid/setgid bit — requires explicit review.",
  },
  {
    category: "env-mutation",
    severity: "caution",
    regex: /\bexport\s+[A-Z_]+\s*=/,
    message: "Mutates shell environment variables.",
  },
  {
    category: "network-heavy-setup",
    severity: "caution",
    regex: /\bnpm\s+install\s+-g\b|\bpnpm\s+add\s+-g\b|\byarn\s+global\s+add\b/i,
    message: "Installs a package globally during setup.",
  },
  {
    category: "install-hook",
    severity: "caution",
    regex: /"(preinstall|postinstall|prepare|install)"\s*:/,
    message: "Declares an npm lifecycle install hook that can run on `npm install`.",
  },
  {
    category: "prompt-injection",
    severity: "caution",
    regex: /\b(ignore|disregard|forget)\s+(all\s+)?previous\s+(instructions|rules|prompts?)\b/i,
    message: "Prompt-injection pattern — text asks the agent to discard prior instructions.",
  },
  {
    category: "prompt-injection",
    severity: "caution",
    regex: /\byou\s+are\s+now\s+(an?|the)\s+[a-z\s]+\s+(assistant|agent|model)\b/i,
    message: "Prompt-injection pattern — text attempts a persona override.",
  },
  {
    category: "prompt-injection",
    severity: "high-risk",
    regex: /system\s*:\s*override\s+(safety|guardrails?|policies)/i,
    message: "Prompt-injection pattern — instructs the agent to override safety rules.",
  },
  {
    category: "shell-script",
    severity: "info",
    regex: /^#!\s*\/(?:usr\/)?bin\/(?:env\s+)?(?:sh|bash|zsh|ksh|fish)\b/m,
    message: "Executable shell script shebang.",
  },
  {
    category: "external-download",
    severity: "caution",
    regex: /\bnpx\s+[^\s]+/i,
    message: "Invokes npx on an arbitrary package.",
  },
];

// ---------------------------------------------------------------------------
// Traversal
// ---------------------------------------------------------------------------

function isLikelyTextFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  if (!ext) return true; // README, LICENSE, etc.
  return TEXT_EXTENSIONS.has(ext);
}

function isSuspiciousBinary(filename: string): boolean {
  return SUSPICIOUS_BINARY_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

function isUnexpectedArchive(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return ARCHIVE_EXTENSIONS.has(ext) || filename.toLowerCase().endsWith(".tar.gz");
}

function shortExcerpt(line: string): string {
  const trimmed = line.trim();
  return trimmed.length <= 120 ? trimmed : `${trimmed.slice(0, 117)}...`;
}

function classify(findings: SecurityFinding[]): SourceRiskClass {
  if (findings.some((f) => f.severity === "blocking")) return "blocked";
  if (findings.some((f) => f.severity === "high-risk")) return "high-risk";
  if (findings.some((f) => f.severity === "caution")) return "caution";
  return "safe";
}

function severityRank(sev: SecurityFinding["severity"]): number {
  switch (sev) {
    case "info": return 0;
    case "caution": return 1;
    case "high-risk": return 2;
    case "blocking": return 3;
  }
}

function summarise(findings: SecurityFinding[], riskClass: SourceRiskClass): string[] {
  if (findings.length === 0) {
    return [`Risk: ${riskClass}. No security findings surfaced.`];
  }
  const byCategory = new Map<SecurityFindingCategory, number>();
  for (const f of findings) {
    byCategory.set(f.category, (byCategory.get(f.category) ?? 0) + 1);
  }
  const lines: string[] = [`Risk: ${riskClass}. ${findings.length} finding(s).`];
  const ordered = Array.from(byCategory.entries()).sort(
    ([, a], [, b]) => b - a,
  );
  for (const [cat, count] of ordered) {
    lines.push(`  • ${cat}: ${count}`);
  }
  const top = [...findings]
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .slice(0, 3);
  for (const f of top) {
    lines.push(`  [${f.severity}] ${f.path} — ${f.message}`);
  }
  return lines;
}

function walkPayload(
  root: string,
  onFile: (absPath: string, relPath: string) => void,
  limits: { maxFiles: number },
): number {
  let visited = 0;
  const stack: string[] = [root];
  while (stack.length > 0) {
    if (visited >= limits.maxFiles) break;
    const current = stack.pop();
    if (!current) break;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const abs = path.resolve(current, entry.name);
      // Skip .git and node_modules trees entirely — they are noise for
      // the operator review and bloat the inspection budget.
      if (entry.isDirectory()) {
        if (entry.name === ".git" || entry.name === "node_modules") continue;
        stack.push(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const rel = path.relative(root, abs);
      onFile(abs, rel);
      visited += 1;
      if (visited >= limits.maxFiles) break;
    }
  }
  return visited;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface InspectSourcePayloadInput {
  /** Absolute path to the materialised payload root. */
  payloadRoot: string;
  /**
   * When true, escalates minimum severity for `skills-skill` imports so a
   * completely finding-free skill still parks on `caution` (forcing the
   * operator to acknowledge the security report before import). Default
   * is false.
   */
  requireSkillAcknowledgement?: boolean;
}

/**
 * Inspect a materialised source payload and return a
 * `SourceSecurityReport`. Pure read-only.
 */
export function inspectSourcePayload(
  input: InspectSourcePayloadInput,
): SourceSecurityReport {
  const { payloadRoot } = input;
  if (!fs.existsSync(payloadRoot) || !fs.statSync(payloadRoot).isDirectory()) {
    throw new Error(`Inspection target is not a directory: ${payloadRoot}`);
  }

  const findings: SecurityFinding[] = [];
  let bytesInspected = 0;

  const filesInspected = walkPayload(
    payloadRoot,
    (abs, rel) => {
      let size = 0;
      try {
        size = fs.statSync(abs).size;
      } catch {
        return;
      }

      if (isSuspiciousBinary(rel)) {
        findings.push({
          category: "suspicious-binary",
          severity: "high-risk",
          path: rel,
          message: `Payload ships a precompiled binary (${path.extname(rel)}). Review provenance before use.`,
        });
        return;
      }

      if (isUnexpectedArchive(rel)) {
        findings.push({
          category: "unexpected-archive",
          severity: "caution",
          path: rel,
          message: `Payload ships an archive (${path.extname(rel)}) — expand and review contents before use.`,
        });
        return;
      }

      if (!isLikelyTextFile(rel)) return;
      if (bytesInspected + Math.min(size, MAX_BYTES_PER_FILE) > MAX_TOTAL_BYTES) return;

      let buf: Buffer;
      try {
        const handle = fs.openSync(abs, "r");
        try {
          buf = Buffer.alloc(Math.min(size, MAX_BYTES_PER_FILE));
          fs.readSync(handle, buf, 0, buf.length, 0);
        } finally {
          fs.closeSync(handle);
        }
      } catch {
        return;
      }
      bytesInspected += buf.length;
      const text = buf.toString("utf8");

      for (const matcher of TEXT_PATTERNS) {
        const match = matcher.regex.exec(text);
        if (!match) continue;
        findings.push({
          category: matcher.category,
          severity: matcher.severity,
          path: rel,
          message: matcher.message,
          excerpt: shortExcerpt(match[0]),
        });
      }
    },
    { maxFiles: MAX_FILES },
  );

  let riskClass = classify(findings);
  if (
    input.requireSkillAcknowledgement &&
    riskClass === "safe" &&
    findings.length === 0
  ) {
    // Skill imports always require an explicit operator ack — surface a
    // neutral "info" finding so the plan flags confirmation.
    findings.push({
      category: "shell-script",
      severity: "info",
      path: ".",
      message:
        "Skill imports always require operator acknowledgement before the payload is wrapped into a workspace.",
    });
    riskClass = "caution";
  }

  return {
    inspectedAt: new Date().toISOString(),
    filesInspected,
    bytesInspected,
    findings,
    riskClass,
    blocked: findings.some((f) => f.severity === "blocking"),
    summaryLines: summarise(findings, riskClass),
  };
}
