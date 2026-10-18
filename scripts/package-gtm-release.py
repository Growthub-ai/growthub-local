#!/usr/bin/env python3
"""Check, build or verify the existing GTM provider payloads; no network or auth."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parent.parent


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_json(path):
    return json.loads((ROOT / path).read_text())


def digest(data):
    return hashlib.sha256(data).hexdigest()


def payload(directory):
    files = {}
    for path in sorted((ROOT / directory).rglob('*')):
        require(not path.is_symlink(), 'Plugin payload must not contain symlinks')
        if path.is_file():
            rel = path.relative_to(ROOT / directory).as_posix()
            require(not any(p.startswith('.env') or p in {'.git', 'node_modules'}
                            for p in Path(rel).parts), 'Unexpected private/runtime payload')
            files[rel] = path.read_bytes()
    return files


def checked_source():
    catalog = read_json('plugins/gtm-release.json')
    require(catalog['schema'] == 'growthub.plugin-release.v1', 'Unknown release schema')
    require(catalog['releaseId'] == 'ai.growthub.gtm', 'Stable release ID changed')
    require(catalog['pluginName'] == 'growthub-gtm', 'Stable plugin name changed')
    require(catalog['marketplaceName'] == 'growthub', 'Stable marketplace name changed')
    require(catalog['tagPrefix'] == 'growthub-gtm-v', 'Stable tag namespace changed')
    portable = read_json(catalog['versionSource'])
    version = portable['version']
    require(re.fullmatch(r'\d+\.\d+\.\d+', version), 'Use an exact stable SemVer')
    variants = {name: payload(path) for name, path in catalog['variants'].items()}
    require(set(variants) == {'openai', 'codex-native', 'claude'}, 'Missing provider variant')
    common = {k: v for k, v in variants['openai'].items()
              if k not in {'plugin.json', 'mcp.json', '.mcp.json', '.codex-plugin/plugin.json'}}
    identity = {k: v for k, v in portable.items() if k not in {'$schema', 'extensions'}}
    require(portable['name'] == catalog['pluginName'], 'Canonical identity drift')
    expected_servers = catalog['mcpServers']
    require(set(expected_servers) == {'growthub-brand-kit', 'growthub-ceo', 'growthub-knowledge'},
            'Stable MCP names changed')
    expected_paths = {'growthub-brand-kit': '/api/v1/mcp',
                      'growthub-ceo': '/api/v1/mcp/ceo',
                      'growthub-knowledge': '/api/v1/mcp/knowledge'}
    for name, spec in expected_servers.items():
        require(spec['url'] == 'https://www.growthub.ai' + expected_paths[name], 'MCP URL drift')
        require(spec['serverVersion'] == '1.0.0', 'Review a separate MCP compatibility change')
    native = read_json('plugins/growthub-gtm/.mcp.json')['mcpServers']
    public = read_json('plugins/growthub-gtm/mcp.json')['mcpServers']
    require(set(native) == set(public) == set(expected_servers), 'MCP inventory drift')
    for name, spec in native.items():
        require(spec == {'url': expected_servers[name]['url'],
                         'bearer_token_env_var': 'GROWTHUB_API_TOKEN'}, 'Native auth/URL drift')
        require(public[name]['url'] == spec['url'], 'Public MCP URL drift')
        require(public[name]['type'] == 'streamable-http', 'Public MCP transport drift')
        require(public[name]['extensions']['com.openai']['auth'] ==
                {'type': 'api_key', 'headerScheme': 'bearer'}, 'Public auth contract drift')
    for variant, files in variants.items():
        manifest_name = '.claude-plugin/plugin.json' if variant == 'claude' else '.codex-plugin/plugin.json'
        manifest = json.loads(files[manifest_name])
        require(manifest['name'] == portable['name'] and manifest['version'] == version,
                'Provider identity/version drift')
        if variant != 'openai':
            require(set(files) == set(common) | {manifest_name, '.mcp.json'}, 'Native payload file drift')
            require(all(files[k] == v for k, v in common.items()), 'Generated shared content drift')
        if variant == 'claude':
            require(manifest == identity, 'Claude generated manifest drift')
            expected = {name: {'type': 'http', 'url': spec['url'],
                              'headers': {'Authorization': 'Bearer ${GROWTHUB_API_TOKEN}'}}
                        for name, spec in expected_servers.items()}
            require(json.loads(files['.mcp.json'])['mcpServers'] == expected, 'Claude auth/URL drift')
        elif variant == 'codex-native':
            require(files['.mcp.json'] == variants['openai']['.mcp.json'], 'Codex MCP projection drift')
            require(files[manifest_name] == variants['openai'][manifest_name], 'Codex manifest projection drift')
    for file, provider in [('.agents/plugins/marketplace.json', 'codex-native'),
                           ('.claude-plugin/marketplace.json', 'claude')]:
        market = read_json(file)
        require(market['name'] == catalog['marketplaceName'], 'Marketplace identity drift')
        entries = {entry['name']: entry for entry in market['plugins']}
        require(catalog['legacyPluginName'] in entries, 'Existing console entry removed')
        source = entries[catalog['pluginName']]['source']
        source = source['path'] if isinstance(source, dict) else source
        require(source == './' + catalog['variants'][provider], 'Marketplace projection drift')
    return catalog, version, variants


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['check', 'build', 'verify'])
    parser.add_argument('--out', type=Path, help='External artifact directory for build/verify')
    args = parser.parse_args()
    catalog, version, variants = checked_source()
    summary = {'schema': 'growthub.plugin-release-receipt.v1', 'releaseId': catalog['releaseId'],
               'version': version, 'tag': catalog['tagPrefix'] + version,
               'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
               'artifacts': []}
    if args.command != 'check':
        require(args.out is not None, '--out is required')
        out = args.out.resolve()
        require(not out.is_relative_to(ROOT), 'Keep generated release artifacts outside Git')
        names = [f'growthub-gtm-{name}-{version}.zip' for name in variants]
        if args.command == 'build':
            require(not any((out / name).exists() for name in names + ['release-manifest.json', 'SHA256SUMS']),
                    'Refusing to overwrite existing release artifacts')
            out.mkdir(parents=True, exist_ok=True)
    for name, files in variants.items():
        rows = [{'path': path, 'bytes': len(data), 'sha256': digest(data)} for path, data in files.items()]
        tree = digest(json.dumps(rows, separators=(',', ':'), ensure_ascii=False).encode())
        row = {'provider': name, 'file': f'growthub-gtm-{name}-{version}.zip',
               'fileCount': len(rows), 'payloadSha256': tree, 'files': rows}
        if args.command != 'check':
            archive = out / row['file']
            if args.command == 'build':
                with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
                    for path, data in files.items():
                        info = zipfile.ZipInfo(path, tuple(catalog['archiveTimestamp']))
                        info.external_attr = 0o100644 << 16
                        info.compress_type = zipfile.ZIP_DEFLATED
                        z.writestr(info, data)
            with zipfile.ZipFile(archive) as z:
                require(z.testzip() is None, 'ZIP integrity failure')
                require(z.namelist() == list(files), 'Archive membership/order drift')
                require(all(z.read(path) == data for path, data in files.items()), 'Archive/source mismatch')
            row.update(sha256=digest(archive.read_bytes()), bytes=archive.stat().st_size)
        summary['artifacts'].append(row)
    if args.command == 'build':
        (out / 'release-manifest.json').write_text(json.dumps(summary, indent=2) + '\n')
        (out / 'SHA256SUMS').write_text(''.join(f"{a['sha256']}  {a['file']}\n" for a in summary['artifacts']))
    elif args.command == 'verify':
        saved = json.loads((out / 'release-manifest.json').read_text())
        require(saved == summary, 'Release receipt no longer matches source/archives')
        sums = ''.join(f"{a['sha256']}  {a['file']}\n" for a in summary['artifacts'])
        require((out / 'SHA256SUMS').read_text() == sums, 'Checksum list drift')
    print(json.dumps({'ok': True, 'command': args.command, 'releaseId': catalog['releaseId'],
                      'version': version, 'artifacts': [{k: v for k, v in a.items() if k != 'files'}
                                                       for a in summary['artifacts']]}, indent=2))


if __name__ == '__main__':
    main()
