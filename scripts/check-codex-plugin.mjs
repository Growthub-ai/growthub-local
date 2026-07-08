#!/usr/bin/env node
/**
 * check-codex-plugin.mjs — structural + lockstep gate for the Codex plugin
 * marketplace surface (.agents/plugins/marketplace.json + plugins/**).
 */

import fs from "node:fs";
import path from "node:path";

const SELF = path.resolve(new URL(import.meta.url).pathname);
const repoRoot = path.resolve(path.dirname(SELF), "..");
const JSON_OUT = process.argv.includes("--json");

const errors = [];
const checked = { plugins: [], skills: 0, hooks: 0 };
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
  const text = fs.readFileSync(path.join(repoRoot, rel), "utf8");
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (kv) fields[kv[1]] = kv[2].trim();
  }
  return fields;
}

const cliPkg = readJson("cli/package.json");
const cliVersion = cliPkg?.version ?? null;
if (!cliVersion) errors.push("cli/package.json has no version — cannot enforce lockstep");

const marketplace = readJson(".agents/plugins/marketplace.json");
const pluginDirs = [];

if (marketplace) {
  if (!KEBAB.test(marketplace.name ?? "")) errors.push(`marketplace name "${marketplace.name}" must be kebab-case`);
  if (!marketplace.interface?.displayName) errors.push("marketplace.json: interface.displayName is required");
  if (!Array.isArray(marketplace.plugins) || marketplace.plugins.length === 0) {
    errors.push("marketplace.json: plugins[] must be a non-empty array");
  } else {
    for (const entry of marketplace.plugins) {
      if (!KEBAB.test(entry.name ?? "")) errors.push(`marketplace entry name "${entry.name}" must be kebab-case`);
      if (entry.source?.source !== "local") errors.push(`marketplace entry "${entry.name}": source.source must be "local"`);
      if (typeof entry.source?.path !== "string" || !entry.source.path.startsWith("./")) {
        errors.push(`marketplace entry "${entry.name}": source.path must be a relative path starting with "./"`);
        continue;
      }
      if (!entry.policy?.installation || !entry.policy?.authentication) {
        errors.push(`marketplace entry "${entry.name}": policy.installation and policy.authentication are required`);
      }
      if (!entry.category) errors.push(`marketplace entry "${entry.name}": category is required`);
      const dirRel = path.normalize(entry.source.path);
      if (dirRel.startsWith("..")) {
        errors.push(`marketplace entry "${entry.name}": source escapes the repo (${dirRel})`);
        continue;
      }
      const manifestRel = path.join(dirRel, ".codex-plugin", "plugin.json");
      if (!fs.existsSync(path.join(repoRoot, manifestRel))) {
        errors.push(`marketplace entry "${entry.name}": ${manifestRel} does not exist`);
        continue;
      }
      pluginDirs.push({ entryName: entry.name, dirRel });
    }
  }
}

for (const { entryName, dirRel } of pluginDirs) {
  const manifest = readJson(path.join(dirRel, ".codex-plugin", "plugin.json"));
  if (!manifest) continue;
  checked.plugins.push(manifest.name ?? entryName);

  if (manifest.name !== entryName) errors.push(`${dirRel}: plugin.json name "${manifest.name}" != marketplace entry "${entryName}"`);
  if (manifest.name !== path.basename(dirRel)) errors.push(`${dirRel}: plugin.json name "${manifest.name}" != directory name "${path.basename(dirRel)}"`);
  if (!KEBAB.test(manifest.name ?? "")) errors.push(`${dirRel}: plugin name must be kebab-case`);
  for (const field of ["description", "author", "license", "version", "interface"]) {
    if (!manifest[field]) errors.push(`${dirRel}: plugin.json missing field "${field}"`);
  }
  if (!manifest.author?.name) errors.push(`${dirRel}: plugin.json author.name is required`);
  if (!manifest.interface?.displayName || !manifest.interface?.shortDescription || !manifest.interface?.longDescription) {
    errors.push(`${dirRel}: plugin.json interface needs displayName, shortDescription, and longDescription`);
  }
  if (manifest.hooks) errors.push(`${dirRel}: plugin.json must not declare unsupported top-level hooks; use default hooks/hooks.json discovery`);
  if (cliVersion && manifest.version && manifest.version !== cliVersion) {
    errors.push(`${dirRel}: plugin version ${manifest.version} != cli/package.json ${cliVersion} (lockstep rule)`);
  }

  for (const [field, value] of Object.entries(manifest.interface ?? {})) {
    if (!["composerIcon", "logo", "logoDark"].includes(field)) continue;
    if (typeof value !== "string" || !value.startsWith("./")) {
      errors.push(`${dirRel}: interface.${field} must be a relative path starting with "./"`);
      continue;
    }
    if (!fs.existsSync(path.join(repoRoot, dirRel, value))) errors.push(`${dirRel}: interface.${field} points to missing asset ${value}`);
  }

  for (const rel of [manifest.skills, typeof manifest.mcpServers === "string" ? manifest.mcpServers : null].filter(Boolean)) {
    if (!rel.startsWith("./")) errors.push(`${dirRel}: component path "${rel}" must start with "./"`);
    else if (path.normalize(rel).startsWith("..")) errors.push(`${dirRel}: component path "${rel}" escapes the plugin root`);
    else if (!fs.existsSync(path.join(repoRoot, dirRel, rel))) errors.push(`${dirRel}: component path "${rel}" does not exist`);
  }

  const mcpRel = typeof manifest.mcpServers === "string" ? manifest.mcpServers : "./.mcp.json";
  const mcp = fs.existsSync(path.join(repoRoot, dirRel, mcpRel)) ? readJson(path.join(dirRel, mcpRel)) : null;
  if (mcp?.mcpServers && typeof mcp.mcpServers === "object") {
    for (const [serverName, server] of Object.entries(mcp.mcpServers)) {
      if (!server.command && !server.url) errors.push(`${dirRel}: MCP server "${serverName}" has neither command nor url`);
      const pin = (server.args ?? []).find((a) => typeof a === "string" && a.startsWith("@growthub/cli"));
      if (!pin) errors.push(`${dirRel}: MCP server "${serverName}" must pin @growthub/cli exactly`);
      else {
        const pinned = pin.split("@")[2] ?? null;
        if (!pinned) errors.push(`${dirRel}: MCP server "${serverName}" must pin an exact @growthub/cli version (got "${pin}")`);
        else if (cliVersion && pinned !== cliVersion) errors.push(`${dirRel}: MCP server "${serverName}" pins @growthub/cli@${pinned} != cli/package.json ${cliVersion}`);
      }
    }
  } else if (mcp) {
    errors.push(`${dirRel}: ${mcpRel} must contain an mcpServers object`);
  }

  const skillsDir = path.join(repoRoot, dirRel, "skills");
  if (fs.existsSync(skillsDir)) {
    for (const slug of fs.readdirSync(skillsDir).filter((f) => fs.statSync(path.join(skillsDir, f)).isDirectory())) {
      const skillRel = path.join(dirRel, "skills", slug, "SKILL.md");
      if (!fs.existsSync(path.join(repoRoot, skillRel))) {
        errors.push(`${skillRel} is missing`);
        continue;
      }
      checked.skills += 1;
      const fm = frontmatter(skillRel);
      if (!fm) errors.push(`${skillRel}: missing YAML frontmatter`);
      else {
        if (fm.name !== slug) errors.push(`${skillRel}: frontmatter name "${fm.name}" != directory slug "${slug}"`);
        if (!fm.description || fm.description.length < 40) errors.push(`${skillRel}: description missing or too thin (< 40 chars)`);
      }
    }
  }

  for (const hooksRel of [path.join(dirRel, "hooks.json"), path.join(dirRel, "hooks", "hooks.json")]) {
    if (!fs.existsSync(path.join(repoRoot, hooksRel))) continue;
    checked.hooks += 1;
    const hooks = readJson(hooksRel);
    if (!hooks?.hooks?.SessionStart) errors.push(`${hooksRel}: expected hooks.SessionStart`);
  }

  const walk = (dir) => {
    for (const item of fs.readdirSync(dir)) {
      const full = path.join(dir, item);
      if (fs.lstatSync(full).isSymbolicLink()) errors.push(`${path.relative(repoRoot, full)}: symlinks are not allowed inside a plugin`);
      else if (fs.statSync(full).isDirectory()) walk(full);
    }
  };
  walk(path.join(repoRoot, dirRel));
}

if (JSON_OUT) {
  console.log(JSON.stringify({ ok: errors.length === 0, cliVersion, checked, errors }, null, 2));
} else {
  for (const e of errors) console.error(`  ✗ ${e}`);
  if (errors.length === 0) {
    console.log(`✓ Codex plugin surface OK — ${checked.plugins.length} plugin(s) [${checked.plugins.join(", ")}], ${checked.skills} skill(s), ${checked.hooks} hook file(s), lockstep @ ${cliVersion}.`);
  } else {
    console.error(`\n${errors.length} error(s) — the Codex plugin surface is not shippable.`);
  }
}
process.exit(errors.length === 0 ? 0 : 1);
