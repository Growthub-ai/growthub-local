#!/usr/bin/env node
/**
 * check-claude-plugin.mjs — structural + lockstep gate for the Claude Code
 * plugin marketplace surface (.claude-plugin/marketplace.json + claude-plugins/**).
 *
 * Enforces the contract in docs/CLAUDE_CODE_PLUGIN_MARKETPLACE_V1.md:
 *   1. marketplace.json parses, has name/owner/plugins, and every relative
 *      plugin source (under metadata.pluginRoot) resolves to a directory
 *      containing .claude-plugin/plugin.json.
 *   2. Each plugin.json has a kebab-case name matching both its marketplace
 *      entry and its directory, plus production metadata (description,
 *      author, license, version).
 *   3. VERSION LOCKSTEP: plugin version == @growthub/cli version pinned in
 *      the plugin's .mcp.json == cli/package.json version. A CLI release
 *      cannot ship without the console following it.
 *   4. Every skills/<slug>/SKILL.md has frontmatter name (== slug) and a
 *      non-empty description; every agents/*.md has name + description.
 *   5. hooks.json parses and every ${CLAUDE_PLUGIN_ROOT} script it references
 *      exists and is executable.
 *   6. No symlinks inside a plugin (they break marketplace installation
 *      copying) and no "../" path escapes in declared component paths.
 *
 * Usage: node scripts/check-claude-plugin.mjs [--json]
 * Exit 0 = surface is shippable. Exit 1 = itemized errors.
 */

import fs from "node:fs";
import path from "node:path";

const SELF = path.resolve(new URL(import.meta.url).pathname);
const repoRoot = path.resolve(path.dirname(SELF), "..");
const JSON_OUT = process.argv.includes("--json");

const errors = [];
const warnings = [];
const checked = { plugins: [], skills: 0, agents: 0, hooks: 0 };

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function readJson(rel) {
  const full = path.join(repoRoot, rel);
  if (!fs.existsSync(full)) {
    errors.push(`missing file: ${rel}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(full, "utf8"));
  } catch (error) {
    errors.push(`${rel}: JSON parse error — ${error.message}`);
    return null;
  }
}

function frontmatter(rel) {
  const full = path.join(repoRoot, rel);
  const text = fs.readFileSync(full, "utf8");
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (kv) fields[kv[1]] = kv[2].trim();
  }
  return fields;
}

// ---------------------------------------------------------------------------
// 0. The one version every pin must equal.
// ---------------------------------------------------------------------------
const cliPkg = readJson("cli/package.json");
const cliVersion = cliPkg?.version ?? null;
if (!cliVersion) errors.push("cli/package.json has no version — cannot enforce lockstep");

// ---------------------------------------------------------------------------
// 1. Marketplace manifest.
// ---------------------------------------------------------------------------
const marketplace = readJson(".claude-plugin/marketplace.json");
const pluginDirs = [];

if (marketplace) {
  if (!KEBAB.test(marketplace.name ?? "")) errors.push(`marketplace name "${marketplace.name}" must be kebab-case`);
  if (!marketplace.owner?.name) errors.push("marketplace.json: owner.name is required");
  if (!Array.isArray(marketplace.plugins) || marketplace.plugins.length === 0) {
    errors.push("marketplace.json: plugins[] must be a non-empty array");
  } else {
    const pluginRoot = marketplace.metadata?.pluginRoot ?? ".";
    for (const entry of marketplace.plugins) {
      if (!KEBAB.test(entry.name ?? "")) errors.push(`marketplace entry name "${entry.name}" must be kebab-case`);
      if (typeof entry.source !== "string" || !entry.source.startsWith("./")) {
        errors.push(`marketplace entry "${entry.name}": source must be a relative path starting with "./" (got ${JSON.stringify(entry.source)})`);
        continue;
      }
      const dirRel = path.normalize(path.join(pluginRoot, entry.source));
      if (dirRel.startsWith("..")) {
        errors.push(`marketplace entry "${entry.name}": source escapes the repo (${dirRel})`);
        continue;
      }
      const manifestRel = path.join(dirRel, ".claude-plugin", "plugin.json");
      if (!fs.existsSync(path.join(repoRoot, manifestRel))) {
        errors.push(`marketplace entry "${entry.name}": ${manifestRel} does not exist`);
        continue;
      }
      pluginDirs.push({ entryName: entry.name, dirRel });
    }
  }
}

// ---------------------------------------------------------------------------
// 2-6. Each plugin.
// ---------------------------------------------------------------------------
for (const { entryName, dirRel } of pluginDirs) {
  const manifest = readJson(path.join(dirRel, ".claude-plugin", "plugin.json"));
  if (!manifest) continue;
  checked.plugins.push(manifest.name ?? entryName);

  if (manifest.name !== entryName) errors.push(`${dirRel}: plugin.json name "${manifest.name}" != marketplace entry "${entryName}"`);
  if (manifest.name !== path.basename(dirRel)) errors.push(`${dirRel}: plugin.json name "${manifest.name}" != directory name "${path.basename(dirRel)}"`);
  if (!KEBAB.test(manifest.name ?? "")) errors.push(`${dirRel}: plugin name must be kebab-case`);
  for (const field of ["description", "author", "license", "version"]) {
    if (!manifest[field]) errors.push(`${dirRel}: plugin.json missing production metadata field "${field}"`);
  }

  // Version lockstep: plugin.json == cli/package.json.
  if (cliVersion && manifest.version && manifest.version !== cliVersion) {
    errors.push(`${dirRel}: plugin version ${manifest.version} != cli/package.json ${cliVersion} (lockstep rule)`);
  }

  // Declared component paths must be relative and stay inside the plugin.
  for (const field of ["mcpServers", "hooks", "skills", "commands", "agents"]) {
    const value = manifest[field];
    const paths = typeof value === "string" ? [value] : Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
    for (const rel of paths) {
      if (!rel.startsWith("./")) errors.push(`${dirRel}: plugin.json ${field} path "${rel}" must start with "./"`);
      if (path.normalize(rel).startsWith("..")) errors.push(`${dirRel}: plugin.json ${field} path "${rel}" escapes the plugin root`);
      else if (!fs.existsSync(path.join(repoRoot, dirRel, rel))) errors.push(`${dirRel}: plugin.json ${field} path "${rel}" does not exist`);
    }
  }

  // MCP config + CLI pin lockstep.
  const mcpRel = typeof manifest.mcpServers === "string" ? manifest.mcpServers : "./.mcp.json";
  const mcp = fs.existsSync(path.join(repoRoot, dirRel, mcpRel)) ? readJson(path.join(dirRel, mcpRel)) : null;
  if (mcp?.mcpServers && typeof mcp.mcpServers === "object") {
    for (const [serverName, server] of Object.entries(mcp.mcpServers)) {
      if (!server.command && !server.url) {
        errors.push(`${dirRel}: MCP server "${serverName}" has neither command nor url`);
        continue;
      }
      const pin = (server.args ?? []).find((a) => typeof a === "string" && a.startsWith("@growthub/cli"));
      if (pin) {
        const pinned = pin.split("@")[2] ?? null; // "@growthub/cli@x.y.z" → x.y.z
        if (!pinned) errors.push(`${dirRel}: MCP server "${serverName}" must pin an exact @growthub/cli version (got "${pin}")`);
        else if (cliVersion && pinned !== cliVersion) errors.push(`${dirRel}: MCP server "${serverName}" pins @growthub/cli@${pinned} != cli/package.json ${cliVersion} (lockstep rule)`);
      }
    }
  } else if (mcp) {
    errors.push(`${dirRel}: ${mcpRel} must contain an mcpServers object`);
  }

  // Skills.
  const skillsDir = path.join(repoRoot, dirRel, "skills");
  if (fs.existsSync(skillsDir)) {
    for (const slug of fs.readdirSync(skillsDir).filter((f) => fs.statSync(path.join(skillsDir, f)).isDirectory())) {
      const skillRel = path.join(dirRel, "skills", slug, "SKILL.md");
      if (!fs.existsSync(path.join(repoRoot, skillRel))) {
        errors.push(`${skillRel} is missing (every skills/<slug>/ needs a SKILL.md)`);
        continue;
      }
      checked.skills += 1;
      const fm = frontmatter(skillRel);
      if (!fm) errors.push(`${skillRel}: missing YAML frontmatter`);
      else {
        if (fm.name !== slug) errors.push(`${skillRel}: frontmatter name "${fm.name}" != directory slug "${slug}"`);
        if (!fm.description || fm.description.length < 40) errors.push(`${skillRel}: description missing or too thin (< 40 chars) to be discoverable`);
      }
    }
  }

  // Agents.
  const agentsDir = path.join(repoRoot, dirRel, "agents");
  if (fs.existsSync(agentsDir)) {
    for (const file of fs.readdirSync(agentsDir).filter((f) => f.endsWith(".md"))) {
      checked.agents += 1;
      const fm = frontmatter(path.join(dirRel, "agents", file));
      if (!fm?.name || !fm?.description) errors.push(`${path.join(dirRel, "agents", file)}: agent frontmatter needs name + description`);
    }
  }

  // Hooks: parse + referenced ${CLAUDE_PLUGIN_ROOT} scripts exist and are executable.
  const hooksRel = typeof manifest.hooks === "string" ? manifest.hooks : "./hooks/hooks.json";
  if (fs.existsSync(path.join(repoRoot, dirRel, hooksRel))) {
    const hooks = readJson(path.join(dirRel, hooksRel));
    if (hooks) {
      checked.hooks += 1;
      const text = JSON.stringify(hooks);
      for (const match of text.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}([^"\\ ]+)/g)) {
        const scriptRel = path.join(dirRel, match[1]);
        const full = path.join(repoRoot, scriptRel);
        if (!fs.existsSync(full)) errors.push(`${path.join(dirRel, hooksRel)}: referenced script ${scriptRel} does not exist`);
        else if (!(fs.statSync(full).mode & 0o111)) errors.push(`${scriptRel} is not executable (chmod +x)`);
      }
    }
  }

  // Symlinks break marketplace install copying — forbid them inside plugins.
  const walk = (dir) => {
    for (const item of fs.readdirSync(dir)) {
      const full = path.join(dir, item);
      if (fs.lstatSync(full).isSymbolicLink()) errors.push(`${path.relative(repoRoot, full)}: symlinks are not allowed inside a plugin`);
      else if (fs.statSync(full).isDirectory()) walk(full);
    }
  };
  walk(path.join(repoRoot, dirRel));
}

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------
if (JSON_OUT) {
  console.log(JSON.stringify({ ok: errors.length === 0, cliVersion, checked, errors, warnings }, null, 2));
} else {
  for (const w of warnings) console.warn(`  ⚠ ${w}`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  if (errors.length === 0) {
    console.log(`✓ Claude plugin surface OK — ${checked.plugins.length} plugin(s) [${checked.plugins.join(", ")}], ${checked.skills} skill(s), ${checked.agents} agent(s), lockstep @ ${cliVersion}.`);
  } else {
    console.error(`\n${errors.length} error(s) — the Claude plugin surface is not shippable.`);
  }
}
process.exit(errors.length === 0 ? 0 : 1);
