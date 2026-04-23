#!/usr/bin/env bash
# sync-claude.sh
# 호스트 macOS Keychain의 Claude 토큰을 컨테이너로 동기화하고 서버를 재시작합니다.
#
# 사용 시점: 대시보드 배너에 "Claude 인증 필요"가 떴을 때 호스트 터미널에서 실행.
#
#   bash scripts/sync-claude.sh
#
# 내부 동작:
#   1) setup-docker-env.sh — Keychain → ~/.claude/.credentials.json + .env
#   2) docker compose restart server — 새 토큰을 컨테이너가 다시 읽도록
set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"

bash "$DIR/scripts/setup-docker-env.sh"
( cd "$DIR" && docker compose restart server >/dev/null )

echo ""
echo "✓ Claude credential 동기화 + 서버 재시작 완료"
echo "  대시보드 새로고침하면 'Claude Max · OAuth' 정상 표시됩니다."
