#!/bin/bash
# Airflux Agent Bootstrap Script
# 프로젝트 초기 설정 자동화

set -euo pipefail

echo "🚀 Airflux Agent Bootstrap"
echo "========================="
echo ""

# 1. Node.js 버전 확인
echo "📋 Checking prerequisites..."
NODE_VERSION=$(node -v 2>/dev/null || echo "not found")
echo "  Node.js: $NODE_VERSION"
if [[ "$NODE_VERSION" == "not found" ]]; then
  echo "  ❌ Node.js is required. Install Node.js 22+."
  exit 1
fi

# 2. 의존성 설치
echo ""
echo "📦 Installing dependencies..."
npm install

# 3. TypeScript 타입 체크
echo ""
echo "🔍 Running typecheck..."
npx tsc --noEmit && echo "  ✅ TypeScript types OK" || echo "  ⚠️ Type errors found (expected for scaffold)"

# 4. 시크릿 확인
echo ""
echo "🔑 Checking AWS Secrets Manager..."
SECRETS=(
  "airflux/dev/slack-bot-token"
  "airflux/dev/slack-signing-secret"
  "airflux/dev/anthropic-api-key"
  "airflux/dev/snowflake"
)
for secret in "${SECRETS[@]}"; do
  if aws secretsmanager describe-secret --secret-id "$secret" --no-cli-pager &>/dev/null 2>&1; then
    echo "  ✅ $secret"
  else
    echo "  ❌ $secret (create in AWS Secrets Manager)"
  fi
done

# 5. 설정 파일 검증
echo ""
echo "📋 Validating settings..."
for yaml in settings/*.yaml; do
  if [ -f "$yaml" ]; then
    if python3 -c "import yaml; yaml.safe_load(open('$yaml'))" 2>/dev/null; then
      echo "  ✅ $yaml"
    else
      echo "  ❌ $yaml (invalid YAML)"
    fi
  fi
done

# 6. 테스트 실행
echo ""
echo "🧪 Running tests..."
npx vitest run tests/unit --reporter=verbose 2>/dev/null || echo "  ⚠️ Some tests may fail in scaffold state"

# 7. 완료
echo ""
echo "════════════════════════════════════"
echo "✅ Bootstrap complete!"
echo ""
echo "Next steps:"
echo "  1. Create AWS Secrets (see above)"
echo "  2. npx sst dev                    # Start local dev"
echo "  3. Configure Slack App:"
echo "     - Slash Command URL → Gateway URL"
echo "     - Event Subscriptions → Gateway URL"
echo "     - Interactivity → Gateway URL"
echo "  4. Test: @airflux DAU 알려줘"
echo "════════════════════════════════════"
