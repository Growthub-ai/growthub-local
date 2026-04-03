#!/usr/bin/env bash
# =============================================================================
# watch-agents.sh — Live observability snapshot for all running Growthub agents
# Usage: bash scripts/observability/watch-agents.sh [COMPANY_ID]
# =============================================================================

COMPANY_ID="${1:-97a3a131-1041-4c9d-abd8-8c63c67e066a}"
LOG_DIR="$HOME/.paperclip/instances/default/data/run-logs/$COMPANY_ID"
SERVER_LOG="$HOME/.paperclip/instances/default/logs/server.log"
SNAPSHOT_DIR="$HOME/.paperclip/instances/default/observability-snapshots"

mkdir -p "$SNAPSHOT_DIR"

echo ""
echo "============================================================"
echo "  GROWTHUB AGENT OBSERVABILITY"
echo "  Company: $COMPANY_ID"
echo "  Time:    $(date)"
echo "============================================================"
echo ""

# ── 1. Runtime processes ──────────────────────────────────────────────────────
echo "## RUNTIME PROCESSES"
node_pid=$(pgrep -f 'cli/dist/index.js run' | head -1)
if [ -n "$node_pid" ]; then
  echo "  ✓ Paperclip: PID $node_pid"
else
  echo "  ✗ Paperclip: NOT RUNNING"
fi

# Chrome renderer processes — agents live here
chrome_count=$(ps aux | grep 'Chrome Helper (Renderer)' | grep -v grep | wc -l | tr -d ' ')
echo "  Chrome renderers: $chrome_count"
ps aux | grep 'Chrome Helper (Renderer)' | grep -v grep | awk '$3 > 40 {printf "    PID %-6s CPU: %-6s MEM: %s%%\n", $2, $3"%", $4}' | sort -t: -k2 -rn | head -5

# Other agent-relevant apps (from osascript if available)
running_apps=$(osascript -e 'tell application "System Events" to get name of every process whose background only is false' 2>/dev/null | tr ',' '\n' | tr -d ' ' | sort | tr '\n' ' ')
echo "  Active apps: $running_apps"
echo ""

# ── 2. Active run logs ────────────────────────────────────────────────────────
echo "## ACTIVE RUNS"
if [ -d "$LOG_DIR" ]; then
  find "$LOG_DIR" -name "*.ndjson" -newer /tmp/.agent-obs-mark 2>/dev/null | head -1 > /dev/null
  find "$LOG_DIR" -name "*.ndjson" | while read f; do
    agent_id=$(echo "$f" | awk -F'/' '{print $(NF-1)}')
    run_id=$(basename "$f" .ndjson)
    lines=$(wc -l < "$f" | tr -d ' ')
    size=$(du -sh "$f" 2>/dev/null | cut -f1)
    modified=$(stat -f "%Sm" -t "%H:%M:%S" "$f" 2>/dev/null || stat -c "%y" "$f" 2>/dev/null | cut -d'.' -f1 | cut -d' ' -f2)
    # Determine agent name from known IDs
    case "$agent_id" in
      d898be8d*) aname="LeadHunter" ;;
      4b993ee8*) aname="LinkedInSDR" ;;
      f9af5a73*) aname="CEO" ;;
      deb4a632*) aname="SocialReply" ;;
      *) aname="${agent_id:0:8}" ;;
    esac
    echo "  [$aname] run=${run_id:0:8}  events=$lines  size=$size  last=$modified"
  done
else
  echo "  No run logs at $LOG_DIR"
fi
echo ""

# ── 3. Behavioral trace — last 10 actions per active run ──────────────────────
echo "## BEHAVIORAL TRACE (last 10 actions per run)"
echo ""
if [ -d "$LOG_DIR" ]; then
  # Only show runs modified in last 2 hours
  find "$LOG_DIR" -name "*.ndjson" -newer /tmp/.obs-2h 2>/dev/null | head -1 > /dev/null
  find "$LOG_DIR" -name "*.ndjson" | while read f; do
    agent_id=$(echo "$f" | awk -F'/' '{print $(NF-1)}')
    run_id=$(basename "$f" .ndjson)
    case "$agent_id" in
      d898be8d*) aname="LeadHunter" ;;
      4b993ee8*) aname="LinkedInSDR" ;;
      f9af5a73*) aname="CEO" ;;
      deb4a632*) aname="SocialReply" ;;
      *) aname="${agent_id:0:8}" ;;
    esac
    echo "  [$aname / ${run_id:0:8}]"
    python3 - "$f" "$aname" << 'PYEOF'
import sys, json, re

path, agent = sys.argv[1], sys.argv[2]
lines = open(path).readlines()
# Reconstruct stdout stream from chunk format
full_text = ''.join(json.loads(l.strip()).get('chunk','') for l in lines)

actions = []
# Extract embedded JSON events from stdout
for raw in re.split(r'\n(?=\{"type")', full_text):
    raw = raw.strip()
    if not raw.startswith('{"type"'):
        continue
    try:
        obj = json.loads(raw)
        etype = obj.get('type','')
        ts = obj.get('timestamp','')
        t = ts[11:19] if len(ts) > 18 else ''

        if etype == 'assistant':
            for c in obj.get('message',{}).get('content',[]):
                if c.get('type') == 'tool_use':
                    name = c.get('name','')
                    inp = c.get('input',{})
                    tab = f"tab={inp.get('tabId','')} " if isinstance(inp,dict) and inp.get('tabId') else ''
                    if isinstance(inp, dict):
                        detail = (inp.get('url') or inp.get('command','')[:60] or
                                  inp.get('text','')[:60] or inp.get('action','') or str(inp)[:60])
                    else:
                        detail = str(inp)[:60]
                    # Categorize by application context
                    if 'linkedin.com' in str(detail):
                        app = 'LinkedIn'
                    elif 'chrome' in name.lower() or 'navigate' in name.lower():
                        app = 'Chrome'
                    elif 'bash' in name.lower():
                        app = 'Shell'
                    else:
                        app = 'MCP'
                    actions.append(f"    {t} [{app}] {name}: {str(detail)[:70]}")
                elif c.get('type') == 'text':
                    txt = c.get('text','').strip()
                    if txt and not txt.startswith('Tab Context'):
                        actions.append(f"    {t} [TEXT] {txt[:80]}")

        elif etype == 'user':
            ts = obj.get('timestamp','')
            t = ts[11:19] if len(ts) > 18 else ''
            for c in obj.get('message',{}).get('content',[]):
                if isinstance(c,dict) and c.get('type')=='tool_result':
                    content = c.get('content','')
                    if isinstance(content, list):
                        for r in content:
                            if isinstance(r,dict):
                                txt = r.get('text','')
                                if txt and 'linkedin.com/in/' in txt:
                                    profile = txt.split('linkedin.com/in/')[1].split('/')[0].split('"')[0]
                                    actions.append(f"    {t}   ↳ profile: /in/{profile}")
                                    break
    except:
        pass

for a in actions[-10:]:
    print(a)
PYEOF
    echo ""
  done
fi

# ── 4. Cross-agent correlation ────────────────────────────────────────────────
echo "## CROSS-AGENT SUMMARY"
python3 - "$LOG_DIR" << 'PYEOF'
import sys, json, re, os
from collections import defaultdict, Counter

log_dir = sys.argv[1]
if not os.path.isdir(log_dir):
    print("  No log directory found")
    sys.exit(0)

agent_names = {
    'd898be8d': 'LeadHunter',
    '4b993ee8': 'LinkedInSDR',
    'f9af5a73': 'CEO',
    'deb4a632': 'SocialReply',
}

summary = {}
for agent_id in os.listdir(log_dir):
    adir = os.path.join(log_dir, agent_id)
    if not os.path.isdir(adir):
        continue
    aname = agent_names.get(agent_id[:8], agent_id[:8])
    for run_file in sorted(os.listdir(adir))[-1:]:  # most recent run only
        path = os.path.join(adir, run_file)
        lines = open(path).readlines()
        full_text = ''.join(json.loads(l.strip()).get('chunk','') for l in lines)
        
        tools = re.findall(r'"name":"([^"]+)"', full_text)
        profiles = list(dict.fromkeys(re.findall(r'linkedin\.com/in/([a-z0-9\-]+)', full_text)))
        timestamps = re.findall(r'"timestamp":"(2026-[^"]+)"', full_text)
        
        duration = ''
        if len(timestamps) >= 2:
            from datetime import datetime
            try:
                t0 = datetime.fromisoformat(timestamps[0].replace('Z','+00:00'))
                t1 = datetime.fromisoformat(timestamps[-1].replace('Z','+00:00'))
                mins = round((t1-t0).seconds/60, 1)
                duration = f"{mins}min"
            except:
                pass
        
        tool_counts = Counter(tools)
        top_tools = ', '.join(f"{v}x {k.split('__')[-1]}" for k,v in tool_counts.most_common(3))
        
        print(f"  {aname:14} run={run_file[:8]}  duration={duration:8}  tools={len(tools):3}  profiles={len(profiles):3}")
        print(f"    top tools: {top_tools}")
        if profiles:
            print(f"    profiles: {', '.join(profiles[:5])}{'...' if len(profiles)>5 else ''}")
        print()
PYEOF

# ── 5. Save snapshot ──────────────────────────────────────────────────────────
SNAP="$SNAPSHOT_DIR/snapshot-$(date +%Y%m%d-%H%M%S).txt"
echo "============================================================"
echo "Snapshot → $SNAP"
bash "$0" "$COMPANY_ID" > "$SNAP" 2>&1 &
echo "============================================================"
