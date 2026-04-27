#!/usr/bin/env bash
set -euo pipefail
ID="${1:?usage: append-log.sh <id> <pr-url-or-dash> <status>}"
PR_URL="${2:--}"
STATUS="${3:-unknown}"
DATE="$(date +%Y-%m-%d)"
LOG_DIR="docs/improvement/log"
LOG_FILE="$LOG_DIR/$DATE.md"
mkdir -p "$LOG_DIR"
[ -f "$LOG_FILE" ] || printf "# Improvement Log %s\n\n" "$DATE" > "$LOG_FILE"
TS="$(date +%H:%M:%S)"
printf -- "- [%s] %s — %s — %s\n" "$TS" "$ID" "$STATUS" "$PR_URL" >> "$LOG_FILE"
echo "logged: $LOG_FILE"
