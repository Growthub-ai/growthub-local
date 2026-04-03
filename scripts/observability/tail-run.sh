#!/usr/bin/env bash
# =============================================================================
# tail-run.sh — Live-stream a specific agent run with behavioral correlation
# Usage:
#   bash scripts/observability/tail-run.sh                     # list all runs
#   bash scripts/observability/tail-run.sh d898be8d f8a2f45f  # stream specific
#   bash scripts/observability/tail-run.sh d898be8d            # stream latest
# =============================================================================

COMPANY_ID="${3:-97a3a131-1041-4c9d-abd8-8c63c67e066a}"
LOG_DIR="$HOME/.paperclip/instances/default/data/run-logs/$COMPANY_ID"

AGENT_PARTIAL="$1"
RUN_PARTIAL="$2"

agent_names() {
  case "$1" in
    d898be8d*) echo "LeadHunter" ;;
    4b993ee8*) echo "LinkedInSDR" ;;
    f9af5a73*) echo "CEO" ;;
    deb4a632*) echo "SocialReply" ;;
    *) echo "${1:0:8}" ;;
  esac
}

# No args — list all runs
if [ -z "$AGENT_PARTIAL" ]; then
  echo ""
  echo "Available runs (most recent last):"
  echo ""
  find "$LOG_DIR" -name "*.ndjson" | sort | while read f; do
    agent=$(echo "$f" | awk -F'/' '{print $(NF-1)}')
    run=$(basename "$f" .ndjson)
    lines=$(wc -l < "$f" | tr -d ' ')
    size=$(du -sh "$f" 2>/dev/null | cut -f1)
    modified=$(stat -f "%Sm" -t "%H:%M:%S" "$f" 2>/dev/null || stat -c "%y" "$f" 2>/dev/null | cut -d'.' -f1 | cut -d' ' -f2)
    aname=$(agent_names "$agent")
    echo "  $aname   agent=${agent:0:8}  run=${run:0:8}  events=$lines  size=$size  last=$modified"
  done
  echo ""
  echo "Usage: bash scripts/observability/tail-run.sh <agent_prefix> [run_prefix]"
  exit 0
fi

# Find log file
if [ -n "$RUN_PARTIAL" ]; then
  LOG_FILE=$(find "$LOG_DIR" -name "*.ndjson" | grep "$AGENT_PARTIAL" | grep "$RUN_PARTIAL" | head -1)
else
  # Latest run for this agent
  LOG_FILE=$(find "$LOG_DIR" -name "*.ndjson" | grep "$AGENT_PARTIAL" | sort | tail -1)
fi

if [ -z "$LOG_FILE" ]; then
  echo "No log found for agent=$AGENT_PARTIAL run=${RUN_PARTIAL:-latest}"
  exit 1
fi

agent_id=$(echo "$LOG_FILE" | awk -F'/' '{print $(NF-1)}')
run_id=$(basename "$LOG_FILE" .ndjson)
aname=$(agent_names "$agent_id")

echo ""
echo "============================================================"
echo "  STREAMING: $aname"
echo "  Agent: $agent_id"
echo "  Run:   $run_id"
echo "  File:  $LOG_FILE"
echo "============================================================"
echo ""

# First print historical content, then follow
python3 - "$LOG_FILE" << 'PYEOF'
import sys, json, re, os, time

path = sys.argv[1]

# App context detector
def detect_app(tool_name, detail):
    detail_lower = str(detail).lower()
    if 'linkedin' in detail_lower:
        return 'LinkedIn'
    if 'chrome' in tool_name.lower() or 'navigate' in tool_name.lower() or 'javascript' in tool_name.lower():
        return 'Chrome'
    if 'bash' in tool_name.lower():
        return 'Shell/API'
    if 'supabase' in tool_name.lower():
        return 'Supabase'
    if 'gmail' in tool_name.lower():
        return 'Gmail'
    if 'calendar' in tool_name.lower():
        return 'Calendar'
    if 'slack' in tool_name.lower():
        return 'Slack'
    return 'MCP'

def parse_and_print(lines, seen_count=0):
    full_text = ''.join(json.loads(l.strip()).get('chunk','') for l in lines)
    events = list(re.split(r'\n(?=\{"type")', full_text))
    
    printed = 0
    for i, raw in enumerate(events):
        raw = raw.strip()
        if not raw.startswith('{"type"'):
            continue
        if i < seen_count:
            continue
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
                        if isinstance(inp, dict):
                            detail = (inp.get('url') or inp.get('command','')[:80] or
                                      inp.get('text','')[:80] or inp.get('action','') or str(inp)[:80])
                        else:
                            detail = str(inp)[:80]
                        app = detect_app(name, detail)
                        short_name = name.split('__')[-1] if '__' in name else name
                        print(f"  {t} [{app:10}]{tab} → {short_name}: {detail}")
                        printed += 1
                    elif ctype == 'thinking':
                        think = c.get('thinking','')[:120]
                        print(f"  {t} [THINKING  ] {think}...")
                        printed += 1
                    elif ctype == 'text':
                        txt = c.get('text','').strip()
                        if txt and not txt.startswith(('Tab Context', '\n\nTab')):
                            print(f"  {t} [AGENT TEXT] {txt[:120]}")
                            printed += 1

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
                                    txt = r.get('text','')
                                    if txt and len(txt) > 5 and not txt.startswith('Tab Context'):
                                        results.append(txt[:120])
                        elif content and len(str(content)) > 5:
                            results.append(str(content)[:120])
                        for res in results[:2]:
                            print(f"  {t}   ↳ {res}")
                        printed += 1

        except:
            pass
    return len(events)

# Print all historical content first
lines = open(path).readlines()
seen = parse_and_print(lines)
print(f"\n  [live-following {path}...]\n")

# Follow mode
while True:
    time.sleep(2)
    new_lines = open(path).readlines()
    if len(new_lines) > len(lines):
        new_seen = parse_and_print(new_lines, seen)
        lines = new_lines
        seen = new_seen
PYEOF
