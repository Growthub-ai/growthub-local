#!/usr/bin/env node
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'plugins/growthub-gtm');
const nativeMcp = JSON.parse(readFileSync(resolve(source,'.mcp.json'),'utf8'));
const portable = JSON.parse(readFileSync(resolve(source,'plugin.json'),'utf8'));
const { $schema, extensions, ...identity } = portable;
for (const provider of ['claude', 'codex']) {
  const target = resolve(root, `${provider}-plugins/growthub-gtm`);
  // Only generated source directories are replaced; never installed user config.
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  for (const name of ['skills', 'references', 'scripts', 'assets', 'README.md', 'LICENSE', 'review']) cpSync(resolve(source,name), resolve(target,name), { recursive: true });
  if (provider === 'claude') {
    writeFileSync(resolve(target,'.mcp.json'),JSON.stringify({mcpServers:Object.fromEntries(Object.entries(nativeMcp.mcpServers).map(([name,server]) => [name,{type:'http',url:server.url,headers:{Authorization:'Bearer ${GROWTHUB_API_TOKEN}'}}]))},null,2)+'\n');
    mkdirSync(resolve(target,'.claude-plugin'),{recursive:true});
    writeFileSync(resolve(target,'.claude-plugin/plugin.json'),JSON.stringify(identity,null,2)+'\n');
  } else {
    // The native Codex loader prioritizes portable mcp.json, whose public
    // review extensions it cannot parse. Keep its existing compatibility
    // manifest and credential reference in a dedicated installation projection.
    cpSync(resolve(source,'.codex-plugin'),resolve(target,'.codex-plugin'),{recursive:true});
    cpSync(resolve(source,'.mcp.json'),resolve(target,'.mcp.json'));
  }
  console.log(`Generated growthub-gtm ${identity.version} for ${provider} from the canonical package.`);
}
