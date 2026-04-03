# Multi-Tenancy & App Context Isolation

> 수백 앱을 다루는 에이전트의 앱별 데이터 격리, 컨텍스트 관리

## 1. 문제

Airflux는 수백 개 앱의 데이터를 관리한다. 에이전트가 질문을 처리할 때:
- "이벤트 수 알려줘" → **어떤 앱?**
- "지난 주 DAU" → 앱 지정 없이 전체? 특정 앱?
- 한 스레드에서 "앱 123" 얘기하다가 → 후속 질문도 같은 앱 맥락

## 2. 앱 컨텍스트 해결 전략

### 2.1 명시적 지정

```
"앱 123의 DAU" → app_id: 123 직접 추출
"쿠팡의 이벤트 수" → appAliases에서 "쿠팡" → subdomain "coupang" → app_id 조회
```

### 2.2 세션 컨텍스트 (암묵적)

```
[스레드 시작] "앱 123의 DAU 알려줘" → app_id: 123 세션에 저장
[후속 질문]   "purchase 이벤트는?" → 세션에서 app_id: 123 자동 적용
[후속 질문]   "다른 앱 456도 비교해줘" → app_id: [123, 456] 확장
```

### 2.3 Slack 채널 기반 (선택적)

특정 Slack 채널이 특정 앱 전용인 경우:

```yaml
# settings/channel-app-mapping.yaml
channels:
  C_COUPANG_SUPPORT: { appId: 123, appName: "쿠팡" }
  C_MUSINSA_DATA: { appId: 456, appName: "무신사" }
  # 매핑 없는 채널은 앱 지정 필수
```

### 2.4 해결 순서

```
1. 질문에서 명시적 앱 ID/이름 추출 → 최우선
2. 세션에 이전 앱 컨텍스트 존재 → 자동 적용
3. 채널-앱 매핑 존재 → 자동 적용
4. 위 모두 없음 → 사용자에게 확인 요청
```

```typescript
interface AppContext {
  appId: number;
  appName: string;
  subdomain: string;
  source: 'explicit' | 'session' | 'channel' | 'none';
}

async function resolveAppContext(
  question: string,
  session: SessionData | undefined,
  channelId: string,
): Promise<AppContext | null> {
  // 1. 질문에서 추출
  const explicit = extractAppFromQuestion(question);
  if (explicit) return { ...explicit, source: 'explicit' };

  // 2. 세션 컨텍스트
  if (session?.currentAppId) {
    const app = await getAppById(session.currentAppId);
    return { appId: app.id, appName: app.name, subdomain: app.subdomain, source: 'session' };
  }

  // 3. 채널 매핑
  const channelMapping = await loadConfig('channel-app-mapping');
  const mapped = channelMapping.channels[channelId];
  if (mapped) return { ...mapped, source: 'channel' };

  // 4. 없음
  return null;
}

function extractAppFromQuestion(question: string): Partial<AppContext> | null {
  // 숫자 ID: "앱 123", "app_id 123"
  const idMatch = question.match(/(?:앱|app[_\s]?id)\s*[:=]?\s*(\d+)/i);
  if (idMatch) return { appId: parseInt(idMatch[1]) };

  // 앱 별칭: "쿠팡", "무신사"
  const aliases = loadSemanticLayer().appAliases;
  for (const [displayName, subdomain] of Object.entries(aliases)) {
    if (question.includes(displayName)) {
      return { appName: displayName, subdomain };
    }
  }

  return null;
}
```

## 3. SQL에 앱 필터 자동 주입

앱 컨텍스트가 있으면 SQL Agent가 자동으로 WHERE 절에 추가:

```typescript
// SQL Agent의 system prompt에 앱 컨텍스트 주입
function buildSqlPromptWithAppContext(basePrompt: string, appContext: AppContext | null): string {
  if (!appContext) return basePrompt;

  return basePrompt + `

## 현재 앱 컨텍스트
앱 ID: ${appContext.appId}
앱 이름: ${appContext.appName}
모든 쿼리에 WHERE app_id = ${appContext.appId} 필터를 포함하세요.
사용자가 다른 앱을 명시적으로 언급하지 않는 한 이 앱에 대해 답하세요.`;
}
```

## 4. 세션에 앱 컨텍스트 저장

```typescript
// SessionData 확장
interface SessionData {
  // 기존 필드...
  currentAppId?: number;
  currentAppName?: string;
  mentionedApps: number[];  // 스레드에서 언급된 모든 앱
}

// 앱 컨텍스트 업데이트
function updateSessionAppContext(session: SessionData, appContext: AppContext): void {
  session.currentAppId = appContext.appId;
  session.currentAppName = appContext.appName;
  if (!session.mentionedApps.includes(appContext.appId)) {
    session.mentionedApps.push(appContext.appId);
  }
}
```

## 5. 앱 미지정 시 UX

```
사용자: "이벤트 수 알려줘"
에이전트: "어떤 앱의 이벤트를 조회할까요?

최근 조회한 앱:
• 쿠팡 (ID: 123)
• 무신사 (ID: 456)

또는 앱 ID나 이름을 알려주세요."
```

```typescript
async function handleNoAppContext(
  responseChannel: ResponseChannel,
  session: SessionData | undefined,
): Promise<void> {
  const recentApps = session?.mentionedApps?.slice(-5) || [];
  const suggestions = recentApps.length > 0
    ? `최근 조회한 앱:\n${(await Promise.all(recentApps.map(async id => {
        const app = await getAppById(id);
        return `• ${app.name} (ID: ${id})`;
      }))).join('\n')}`
    : '앱 ID 또는 이름을 알려주세요. (예: "앱 123", "쿠팡")';

  await responseChannel.sendResult({
    summary: `어떤 앱의 데이터를 조회할까요?\n\n${suggestions}`,
    confidence: 'low',
    metadata: { agentType: 'router', model: '', latencyMs: 0, costUsd: 0, traceId: '', cached: false },
  });
}
```

## 6. 비교 분석 (다중 앱)

```
사용자: "쿠팡과 무신사 비교해줘"
  ↓
Router: 다중 앱 감지 → appContexts: [123, 456]
  ↓
SQL Agent: 두 앱 데이터를 하나의 쿼리로 조회
  WHERE app_id IN (123, 456)
  GROUP BY app_id, ...
  ↓
Insight Agent: 앱 간 비교 분석
```

## 7. 데이터 격리 보장

```typescript
// Guardrail 추가: 앱 간 데이터 접근 제어
// RBAC과 결합 — 특정 사용자는 특정 앱만 접근 가능

interface AppAccessRule {
  userId: string;
  allowedAppIds: number[] | 'all';
}

function checkAppAccess(userId: string, requestedAppId: number): boolean {
  const rules = loadConfig<AppAccessRule[]>('app-access');
  const rule = rules.find(r => r.userId === userId);
  if (!rule) return true;  // 기본: 모든 앱 접근 가능
  if (rule.allowedAppIds === 'all') return true;
  return rule.allowedAppIds.includes(requestedAppId);
}
```

## 8. 설계 결정 이유

| 결정 | 이유 |
|------|------|
| 4단계 해결 순서 | 명시 > 세션 > 채널 > 질문 — 가장 정확한 것 우선 |
| 앱 미지정 시 질문 | 잘못된 앱 데이터 반환보다 확인이 안전 |
| WHERE 자동 주입 | LLM이 app_id 필터를 빼먹는 실수 방지 |
| 세션에 mentionedApps | 비교 분석 시 이전 앱 참조 가능 |
| channel-app 매핑 | CS 팀 전용 채널 등에서 매번 앱 지정 불필요 |
