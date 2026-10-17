#!/usr/bin/env node
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'plugins/growthub-gtm');
const target = resolve(root, 'claude-plugins/growthub-gtm');
// Only this generated plugin directory is replaced; never installed user config.
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
for (const name of ['skills', 'references', 'scripts', 'assets', 'README.md', 'LICENSE', 'review', '.mcp.json']) cpSync(resolve(source,name), resolve(target,name), { recursive: true });
const portable = JSON.parse(readFileSync(resolve(source,'plugin.json'),'utf8'));
const { $schema, extensions, ...identity } = portable;
mkdirSync(resolve(target,'.claude-plugin'),{recursive:true});
writeFileSync(resolve(target,'.claude-plugin/plugin.json'),JSON.stringify(identity,null,2)+'\n');
console.log(`Generated growthub-gtm ${identity.version} for Claude from the canonical package.`);
