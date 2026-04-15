#!/bin/sh
# docker-entrypoint.sh
# 컨테이너 시작 시 CLI 인증을 자동으로 설정한 후 서버를 시작합니다.

# Codex CLI: OPENAI_API_KEY가 있으면 자동 로그인
if [ -n "$OPENAI_API_KEY" ]; then
  echo "$OPENAI_API_KEY" | codex login --with-api-key 2>/dev/null && \
    echo "[entrypoint] Codex CLI: authenticated with OPENAI_API_KEY" || \
    echo "[entrypoint] Codex CLI: login failed (non-fatal)"
fi

# Claude CLI 상태 확인 (credentials.json 마운트 시 자동)
if claude auth status --json 2>/dev/null | grep -q '"loggedIn": true'; then
  echo "[entrypoint] Claude CLI: authenticated"
else
  echo "[entrypoint] Claude CLI: not authenticated (using ANTHROPIC_AUTH_TOKEN or API key)"
fi

exec node packages/server/dist/index.js
