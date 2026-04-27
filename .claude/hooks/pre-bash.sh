#!/usr/bin/env bash
# Pre-bash safety hook for self-improvement loop.
# Blocks destructive commands at the tool layer as defense-in-depth on top of settings.local.json deny.
# NOTE: regex-based deny is best-effort. Bash heredoc / eval / base64 / variable
# expansion can theoretically bypass. The primary trust boundary is the LLM's own
# instructions in .claude/commands/improve-airops.md (do not invoke destructive commands).
# This hook catches accidental / unintended invocations.
set -eEuo pipefail
CMD="${CLAUDE_TOOL_INPUT:-${1:-}}"
DENY_PATTERNS=(
  'git[[:space:]]+push[[:space:]].*--force'
  'git[[:space:]]+push[[:space:]].*-f([[:space:]]|$)'
  'git[[:space:]]+push[[:space:]]+origin[[:space:]]+main'
  'git[[:space:]]+push[[:space:]]+origin[[:space:]]+master'
  'git[[:space:]]+reset[[:space:]]+--hard[[:space:]]+origin/(main|master|HEAD)'
  'git[[:space:]]+checkout[[:space:]]+main([[:space:]]|$)'
  'git[[:space:]]+checkout[[:space:]]+master([[:space:]]|$)'
  'git[[:space:]]+tag[[:space:]]+-d'
  'git[[:space:]]+update-ref[[:space:]]+-d'
  'git[[:space:]]+worktree[[:space:]]+remove'
  'git[[:space:]]+filter-branch'
  'rm[[:space:]]+-r?f?r?[[:space:]]+/'
  'rm[[:space:]]+-r?f?r?[[:space:]]+~'
  'find[[:space:]].*-delete'
  'rsync[[:space:]].*--delete'
  '\bdd[[:space:]]+if='
  'DROP[[:space:]]+TABLE'
  '>[[:space:]]*\.env'
  '\.credentials'
  '~/\.aws'
  '~/\.ssh'
  'authorized_keys'
  'curl[[:space:]]+http'
  'wget[[:space:]]+http'
  'npm[[:space:]]+publish'
  'npm[[:space:]]+unpublish'
  'yarn[[:space:]]+publish'
  'pnpm[[:space:]]+publish'
  'gh[[:space:]]+repo[[:space:]]+delete'
  'gh[[:space:]]+release[[:space:]]+delete'
  'aws[[:space:]]+s3[[:space:]]+rm'
  'aws[[:space:]]+s3api[[:space:]]+delete'
  'supabase[[:space:]]+db[[:space:]]+reset'
  'supabase[[:space:]].*delete'
  'eval[[:space:]]'
  'base64[[:space:]]+-d'
  'bash[[:space:]]+-c'
  'sh[[:space:]]+-c'
)
for pattern in "${DENY_PATTERNS[@]}"; do
  if echo "$CMD" | grep -Eqi "$pattern"; then
    echo "BLOCKED by improvement-loop safety hook: matched /$pattern/" >&2
    exit 2
  fi
done
exit 0
