#!/usr/bin/env bash
# =============================================================================
# tail-run.sh — Live-stream a specific agent run with full behavioral detail
# Usage:
#   bash scripts/observability/tail-run.sh                      # list all runs
#   bash scripts/observability/tail-run.sh d898be8d             # stream latest for agent
#   bash scripts/observability/tail-run.sh d898be8d f8a2f45f   # stream specific run
# =============================================================================

LOG_DIR="$HOME/.paperclip/instances/default/data/run-logs"
COMPANY_ID="97a3a131-1041-4c9d-abd8-8c63c67e066a"
AGENT_PARTIAL="$1"
RUN_PARTIAL="$2"

KNOWN_d898be8d="Lead Hunter"
KNOWN_4b993ee8="LinkedIn SDR"
KNOWN_f9af5a73="CEO"
KNOWN_deb4a632="Social Reply"

agent_name() {
  case "${1:0:8}" in
    d898be8d) echo "Lead Hunter" ;;
    4b993ee8) echo "LinkedIn SDR" ;;
    f9af5a73) echo "CEO" ;;
    deb4a632) echo "Social Reply" ;;
    *) echo "${1:0:8}" ;;
  esac
}

# No args — list all runs
if [ -z "$AGENT_PARTIAL" ]; then
  echo ""
  echo "All runs (sorted by first activity):"
  echo ""
  python3 - "$LOG_DIR" "$COMPANY_ID" << 'PYEOF'
import json, re, os, sys
from collections import Counter

LOG_DIR, COMPANY_ID = sys.argv[1], sys.argv[2]
KNOWN = {'d898be8d':'Lead Hunter','4b993ee8':'LinkedIn SDR','f9af5a73':'CEO','deb4a632':'Social Reply'}

runs = []
cdir = os.path.join(LOG_DIR, COMPANY_ID)
for agent_id in os.listdir(cdir):
    adir = os.path.join(cdir, agent_id)
    if not os.path.isdir(adir): continue
    aname = KNOWN.get(agent_id[:8], agent_id[:8])
    for run_file in os.listdir(adir):
        path = os.path.join(adir, run_file)
        lines = open(path).readlines()
        full_text = ''.join(json.loads(l.strip()).get('chunk','') for l in lines)
        timestamps = re.findall(r'"timestamp":"(2026-[^"]+)"', full_text)
        t0 = timestamps[0][11:19] if timestamps else '?'
        t1 = timestamps[-1][11:19] if timestamps else '?'
        date = timestamps[0][:10] if timestamps else '?'
        tools = re.findall(r'"name":"([^"]+)"', full_text)
        profiles = list(dict.fromkeys(re.findall(r'linkedin\.com/in/([a-z0-9\-]+)', full_text)))
        size = round(os.path.getsize(path)/1024)
        active = timestamps[-1] > '2026-04-03T05:10:00' if timestamps else False
        runs.append((timestamps[0] if timestamps else '', aname, run_file[:8], date, t0, t1, len(lines), len(tools), len(profiles), size, active))

runs.sort()
for ts, aname, run, date, t0, t1, events, tools, profiles, size, active in runs:
    if events < 5: continue
    flag = ' 🟢' if active else ''
    print(f"  {aname:14} run={run}  {date} {t0}-{t1}  events={events:4}  tools={tools:4}  profiles={profiles:3}  {size}KB{flag}")
PYEOF
  echo ""
  echo "Usage: bash scripts/observability/tail-run.sh <agent_prefix> [run_prefix]"
  exit 0
fi

# Find file
if [ -n "$RUN_PARTIAL" ]; then
  LOG_FILE=$(find "$LOG_DIR/$COMPANY_ID" -name "*.ndjson" | grep "$AGENT_PARTIAL" | grep "$RUN_PARTIAL" | head -1)
else
  LOG_FILE=$(find "$LOG_DIR/$COMPANY_ID" -name "*.ndjson" | grep "$AGENT_PARTIAL" | sort | tail -1)
fi

if [ -z "$LOG_FILE" ]; then
  echo "No log found for agent=$AGENT_PARTIAL run=${RUN_PARTIAL:-latest}"
  exit 1
fi

agent_id=$(echo "$LOG_FILE" | awk -F'/' '{print $(NF-1)}')
run_id=$(basename "$LOG_FILE" .ndjson)
aname=$(agent_name "$agent_id")

echo ""
echo "============================================================"
echo "  $aname  |  run: $run_id"
echo "  $LOG_FILE"
echo "============================================================"
echo ""

python3 - "$LOG_FILE" "$aname" << 'PYEOF'
import sys, json, re, time, os

path, agent = sys.argv[1], sys.argv[2]

def detect_app(tool_name, detail):
    d = str(detail).lower()
    if 'linkedin' in d: return 'LinkedIn'
    if 'leadshark' in d or 'apex.lead' in d: return 'LeadShark'
    if 'chrome' in tool_name.lower() or 'navigate' in tool_name.lower() or 'javascript' in tool_name.lower(): return 'Chrome'
    if 'screenshot' in tool_name.lower() or 'computer' in tool_name.lower(): return 'Screen'
    if 'supabase' in tool_name.lower(): return 'Supabase'
    if 'gmail' in tool_name.lower(): return 'Gmail'
    if 'bash' in tool_name.lower(): return 'Shell'
    return 'MCP'

def parse_events(lines, start_from=0):
    full_text = ''.join(json.loads(l.strip()).get('chunk','') for l in lines)
    events = list(re.split(r'\n(?=\{"type")', full_text))
    out = []
    for i, raw in enumerate(events):
        if i < start_from: continue
        raw = raw.strip()
        if not raw.startswith('{"type"'): continue
        try:
            obj = json.loads(raw)
            etype = obj.get('type','')
            ts = obj.get('timestamp','')
            t = ts[11:19] if len(ts) > 18 else ''

            if etype == 'assistant':
                for c in obj.get('message',{}).get('content',[]):
                    ctype = c.get('type','')
                    if ctype == 'tool_use':
                        name = c.get('name','')
                        inp = c.get('input',{})
                        tab = f" tab={inp.get('tabId','')}" if isinstance(inp,dict) and inp.get('tabId') else ''
                        detail = ''
                        if isinstance(inp, dict):
                            detail = (inp.get('url') or inp.get('command','')[:80] or
                                      inp.get('text','')[:80] or inp.get('action','') or str(inp)[:80])
                        app = detect_app(name, detail)
                        short = name.split('__')[-1] if '__' in name else name
                        out.append(f"  {t} [{app:10}]{tab} → {short}: {str(detail)[:90]}")
                    elif ctype == 'thinking':
                        think = c.get('thinking','')
                        if think:
                            out.append(f"  {t} [THINKING  ] {think[:130]}...")
                    elif ctype == 'text':
                        txt = c.get('text','').strip().replace('\\n',' ')
                        if txt and len(txt) > 30 and 'Tab Context' not in txt:
                            out.append(f"  {t} [AGENT     ] {txt[:150]}")

            elif etype == 'user':
                ts = obj.get('timestamp','')
                t = ts[11:19] if len(ts) > 18 else ''
                for c in obj.get('message',{}).get('content',[]):
                    if isinstance(c,dict) and c.get('type')=='tool_result':
                        content = c.get('content','')
                        results = []
                        if isinstance(content, list):
                            for r in content:
                                if isinstance(r,dict):
                                    txt = r.get('text','').replace('\\n',' ')
                                    if txt and len(txt) > 10 and 'Tab Context' not in txt:
                                        results.append(txt[:120])
                        elif content and len(str(content)) > 10:
                            results.append(str(content)[:120])
                        for res in results[:2]:
                            out.append(f"  {t}   ↳ {res}")
        except: pass
    return len(events), out

# Print history first
lines = open(path).readlines()
seen_count, history = parse_events(lines)
for line in history:
    print(line)

print(f"\n  [live — following {path}...]\n")

# Follow
while True:
    time.sleep(2)
    new_lines = open(path).readlines()
    if len(new_lines) > len(lines):
        new_seen, new_out = parse_events(new_lines, seen_count)
        for line in new_out:
            print(line, flush=True)
        lines = new_lines
        seen_count = new_seen
PYEOF
