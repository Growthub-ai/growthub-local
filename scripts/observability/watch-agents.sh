#!/usr/bin/env bash
# =============================================================================
# watch-agents.sh — Full live observability for all Growthub agents
# Usage: bash scripts/observability/watch-agents.sh [COMPANY_ID] [--today]
# =============================================================================

COMPANY_ID="${1:-97a3a131-1041-4c9d-abd8-8c63c67e066a}"
FILTER="${2:-}"
LOG_DIR="$HOME/.paperclip/instances/default/data/run-logs"
SNAPSHOT_DIR="$HOME/.paperclip/instances/default/observability-snapshots"
mkdir -p "$SNAPSHOT_DIR"

echo ""
echo "============================================================"
echo "  GROWTHUB AGENT OBSERVABILITY"
echo "  Time: $(date)"
echo "  Filter: ${FILTER:-all-time}"
echo "============================================================"
echo ""

# ── 1. System processes ───────────────────────────────────────────────────────
echo "## SYSTEM"
node_pid=$(pgrep -f 'cli/dist/index.js run' | head -1)
[ -n "$node_pid" ] && echo "  ✓ Paperclip runtime: PID $node_pid" || echo "  ✗ Paperclip runtime: NOT RUNNING"
chrome_count=$(ps aux | grep 'Chrome Helper (Renderer)' | grep -v grep | wc -l | tr -d ' ')
echo "  Chrome renderers: $chrome_count active"
ps aux | grep 'Chrome Helper (Renderer)' | grep -v grep | awk '$3 > 40 {printf "  HIGH CPU → PID %-6s  CPU:%-5s  MEM:%s%%\n",$2,$3"%",$4}' | sort -t: -k2 -rn | head -4
running_apps=$(osascript -e 'tell application "System Events" to get name of every process whose background only is false' 2>/dev/null | tr ',' '\n' | tr -d ' ' | sort | tr '\n' ' ')
echo "  Apps: $running_apps"
echo ""

# ── 2. Full agent deep-dive (Python) ─────────────────────────────────────────
python3 - "$LOG_DIR" "$COMPANY_ID" "$FILTER" << 'PYEOF'
import gzip, json, re, os, sys
from datetime import datetime, timezone
from collections import Counter

LOG_DIR, COMPANY_ID, FILTER = sys.argv[1], sys.argv[2], sys.argv[3]

KNOWN = {
    'd898be8d': 'Lead Hunter',
    '4b993ee8': 'LinkedIn SDR',
    'f9af5a73': 'CEO',
    'deb4a632': 'Social Reply',
    'a9de31a0': 'Founding Engineer',
    '204dbfac': 'Founding Engineer',
    'b0172290': 'Agent/b017',
    '1c39a075': 'Agent/1c39',
}

def detect_app(tool_name, detail):
    d = str(detail).lower()
    if 'linkedin' in d: return 'LinkedIn'
    if 'leadshark' in d or 'apex.lead' in d: return 'LeadShark'
    if 'chrome' in tool_name.lower() or 'navigate' in tool_name.lower() or 'javascript' in tool_name.lower() or 'screenshot' in tool_name.lower(): return 'Chrome'
    if 'supabase' in tool_name.lower(): return 'Supabase'
    if 'gmail' in tool_name.lower(): return 'Gmail'
    if 'calendar' in tool_name.lower(): return 'Calendar'
    if 'slack' in tool_name.lower(): return 'Slack'
    if 'bash' in tool_name.lower(): return 'Shell'
    return 'MCP'

today_prefixes = {
    datetime.now().strftime('%Y-%m-%dT'),
    datetime.now(timezone.utc).strftime('%Y-%m-%dT'),
}
all_runs = []

def read_log_lines(path):
    with open(path, 'rb') as f:
        raw = f.read()
    if raw[:2] == b'\x1f\x8b':
        raw = gzip.decompress(raw)
    text = raw.decode('utf-8', errors='replace')
    return text.splitlines()

def iter_chunks(lines):
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        try:
            yield json.loads(stripped).get('chunk', '')
        except Exception:
            continue

for company_id in os.listdir(LOG_DIR):
    if COMPANY_ID != 'all' and company_id != COMPANY_ID: continue
    cdir = os.path.join(LOG_DIR, company_id)
    if not os.path.isdir(cdir): continue
    for agent_id in os.listdir(cdir):
        adir = os.path.join(cdir, agent_id)
        if not os.path.isdir(adir): continue
        aname = KNOWN.get(agent_id[:8], agent_id[:8])
        for run_file in sorted(os.listdir(adir)):
            path = os.path.join(adir, run_file)
            lines = read_log_lines(path)
            full_text = ''.join(iter_chunks(lines))

            if FILTER == '--today':
                timestamps = []
                for prefix in today_prefixes:
                    timestamps.extend(re.findall(f'"timestamp":"({prefix}[^"]+)"', full_text))
                timestamps = sorted(set(timestamps))
            else:
                timestamps = re.findall('"timestamp":"(2026-[^"]+)"', full_text)
            if not timestamps: continue

            t0, t1 = timestamps[0], timestamps[-1]
            try:
                dt0 = datetime.fromisoformat(t0.replace('Z','+00:00'))
                dt1 = datetime.fromisoformat(t1.replace('Z','+00:00'))
                duration_min = round((dt1-dt0).seconds/60, 1)
            except:
                duration_min = 0

            # Tool calls with app context
            tool_events = []
            for raw in re.split(r'\n(?=\{"type")', full_text):
                if not raw.strip().startswith('{"type"'): continue
                try:
                    obj = json.loads(raw.strip())
                    if obj.get('type') == 'assistant':
                        for c in obj.get('message',{}).get('content',[]):
                            if c.get('type') == 'tool_use':
                                name = c.get('name','')
                                inp = c.get('input',{})
                                tab = inp.get('tabId','') if isinstance(inp,dict) else ''
                                detail = ''
                                if isinstance(inp, dict):
                                    detail = (inp.get('url') or inp.get('command','')[:80] or
                                              inp.get('text','')[:80] or inp.get('action','') or str(inp)[:80])
                                app = detect_app(name, detail)
                                short = name.split('__')[-1] if '__' in name else name
                                tool_events.append((app, short, str(detail)[:100], tab))
                except: pass

            # Agent spoken text (deduplicated)
            spoken = []
            seen_keys = set()
            for raw in re.split(r'\n(?=\{"type")', full_text):
                if not raw.strip().startswith('{"type"'): continue
                try:
                    obj = json.loads(raw.strip())
                    if obj.get('type') == 'assistant':
                        for c in obj.get('message',{}).get('content',[]):
                            if c.get('type') == 'text':
                                t = c.get('text','').strip()
                                t = t.replace('\\n',' ').replace('\\t',' ')
                                key = t[:50]
                                if len(t) > 50 and 'Tab Context' not in t and key not in seen_keys:
                                    seen_keys.add(key)
                                    spoken.append(t[:180])
                except: pass

            # Profiles
            profiles = list(dict.fromkeys(re.findall(r'linkedin\.com/in/([a-z0-9\-]+)', full_text)))
            size_kb = round(os.path.getsize(path)/1024)
            active = t1 > '2026-04-03T05:10:00'

            all_runs.append({
                'agent': aname, 'run': run_file[:8],
                't0': t0[11:19], 't1': t1[11:19], 'date': t0[:10],
                'duration': duration_min, 'tools': tool_events,
                'profiles': profiles, 'spoken': spoken,
                'events': len(lines), 'size_kb': size_kb, 'active': active,
            })

all_runs.sort(key=lambda x: x['t0'])

# Print each meaningful run
print("## AGENT RUN DETAILS")
print()
for r in all_runs:
    if len(r['tools']) < 8 and len(r['profiles']) == 0: continue
    status = '🟢 ACTIVE NOW' if r['active'] else '✅ DONE'
    tool_counts = Counter(app for app,_,_,_ in r['tools'])
    top_apps = ' | '.join(f"{app}:{n}" for app,n in tool_counts.most_common(5))
    print(f"  {'─'*61}")
    print(f"  {r['agent']}  [{r['date']} {r['t0']}→{r['t1']} EDT]  {r['duration']}min  {status}")
    print(f"  {len(r['tools'])} tool calls  {len(r['profiles'])} profiles  {r['events']} events  {r['size_kb']}KB")
    print(f"  Apps: {top_apps}")
    if r['profiles']:
        shown = r['profiles'][:12]
        extra = len(r['profiles'])-12
        more = f' +{extra} more' if extra > 0 else ''
        print(f"  Profiles: {', '.join(shown)}{more}")
    if r['spoken']:
        print(f"  What they said:")
        for s in r['spoken'][:6]:
            print(f"    › {s[:150]}")
    print()

# Cross-agent summary
print()
print("## CROSS-AGENT SUMMARY")
print()
from collections import defaultdict
by_agent = defaultdict(lambda: {'runs':0,'tools':0,'profiles':set(),'spoken':[],'size_kb':0})
for r in all_runs:
    a = by_agent[r['agent']]
    a['runs'] += 1
    a['tools'] += len(r['tools'])
    a['profiles'].update(r['profiles'])
    a['spoken'].extend(r['spoken'])
    a['size_kb'] += r['size_kb']

all_profiles_today = set()
total_tools = 0
for agent, d in sorted(by_agent.items(), key=lambda x: -x[1]['tools']):
    all_profiles_today.update(d['profiles'])
    total_tools += d['tools']
    print(f"  {agent:22}  runs={d['runs']}  tools={d['tools']:4}  profiles={len(d['profiles']):3}  data={d['size_kb']}KB")

print()
print(f"  TOTAL TOOL CALLS:      {total_tools}")
print(f"  TOTAL UNIQUE PROFILES: {len(all_profiles_today)}")
print(f"  TOTAL RUNS:            {len(all_runs)}")
PYEOF

SNAP="$SNAPSHOT_DIR/snapshot-$(date +%Y%m%d-%H%M%S).txt"
bash "$0" "$COMPANY_ID" "$FILTER" > "$SNAP" 2>&1 &
echo ""
echo "  Snapshot → $SNAP"
