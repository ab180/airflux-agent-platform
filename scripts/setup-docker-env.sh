#!/usr/bin/env bash
# setup-docker-env.sh
# macOS Keychain에서 Claude Code OAuth 토큰을 추출해:
#   1) .env 파일에 ANTHROPIC_AUTH_TOKEN 저장 (서버 LLM 직접 호출용)
#   2) ~/.claude/.credentials.json 생성 (컨테이너 내 claude auth status용)
#
# Docker Compose 실행 전 한 번만 실행하면 됩니다.
# 사용법: bash scripts/setup-docker-env.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"
CREDS_FILE="$HOME/.claude/.credentials.json"

echo "🔑 Keychain에서 Claude Code 크레덴셜 추출 중..."

RAW=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null || echo "")

if [ -z "$RAW" ]; then
  echo "⚠️  Keychain에서 Claude 크레덴셜을 찾을 수 없습니다."
  echo "   'claude login'으로 먼저 로그인하거나, .env에 ANTHROPIC_API_KEY를 직접 입력하세요."
  exit 1
fi

# Python으로 안전하게 파싱
PARSED=$(python3 - <<PYEOF
import json, sys

raw = '''$RAW'''
d = json.loads(raw)
oauth = d.get('claudeAiOauth', {})
token = oauth.get('accessToken', '')
print(token)
PYEOF
)

if [ -z "$PARSED" ]; then
  echo "⚠️  accessToken 파싱 실패."
  exit 1
fi

# 1. .env에 ANTHROPIC_AUTH_TOKEN 저장
touch "$ENV_FILE"
if grep -q "^ANTHROPIC_AUTH_TOKEN=" "$ENV_FILE" 2>/dev/null; then
  sed -i '' "s|^ANTHROPIC_AUTH_TOKEN=.*|ANTHROPIC_AUTH_TOKEN=$PARSED|" "$ENV_FILE"
else
  echo "ANTHROPIC_AUTH_TOKEN=$PARSED" >> "$ENV_FILE"
fi
echo "✅ .env → ANTHROPIC_AUTH_TOKEN 저장 완료"

# 2. ~/.claude/.credentials.json 생성 (컨테이너 내 claude CLI 인증용)
# 전체 credentials JSON을 claudeAiOauth 키 기준으로 저장
python3 - <<PYEOF
import json, os

raw = '''$RAW'''
d = json.loads(raw)
creds = {"claudeAiOauth": d.get("claudeAiOauth", {})}

path = os.path.expanduser("$CREDS_FILE")
with open(path, "w") as f:
    json.dump(creds, f, indent=2)
print(f"✅ {path} → credentials.json 생성 완료")
PYEOF

echo ""
echo "이제 'docker compose up -d' 실행하세요."
echo "컨테이너 내에서 'claude auth status'가 loggedIn: true로 표시됩니다."
