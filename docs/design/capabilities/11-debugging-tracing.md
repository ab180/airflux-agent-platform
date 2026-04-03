# Debugging & Tracing

> 에이전트 동작을 추적하고 문제를 진단하는 도구와 전략

## 1. 디버그 모드 (`debug:` prefix)

사용자가 `debug:` prefix를 붙이면 에이전트의 내부 사고 과정을 노출:

```
사용자: "debug: 앱 123의 DAU"

에이전트 응답 (디버그 정보 포함):
─────────────────────────────
🔍 Debug: Router
  의도: sql (confidence: high)
  키워드 매칭: DAU → sql

🔍 Debug: App Context
  해결: 명시적 (앱 123)

🔍 Debug: SQL Agent
  Semantic Layer: metrics.dau 선택
  생성 SQL:
    SELECT DATE(event_timestamp) AS dt, COUNT(DISTINCT user_id) AS dau
    FROM airflux.events
    WHERE app_id = 123
      AND event_timestamp >= DATEADD(day, -7, CURRENT_DATE())
    GROUP BY dt ORDER BY dt
  Guardrails: ✅ read-only, ✅ time-range, ✅ row-limit, ✅ pii, ✅ cost
  실행 시간: 1.2초
  행 수: 7

🔍 Debug: 메타데이터
  모델: anthropic/claude-sonnet-4.6
  프롬프트 버전: v2.1
  입력 토큰: 2,500
  출력 토큰: 300
  비용: $0.012
  캐시: system prompt HIT
  Trace ID: abc-123-def
─────────────────────────────
📊 [일반 응답 결과]
─────────────────────────────
```

### 구현

```typescript
// worker.ts에서 debug 모드 분기
if (context.debug) {
  const debugInfo: DebugInfo = {
    router: { intent: routerDecision.agents, confidence: routerDecision.confidence },
    appContext: { appId: appContext?.appId, source: appContext?.source },
    steps: [],
    metadata: {},
  };

  // 각 에이전트 실행 시 디버그 정보 수집
  for (const step of plan.steps) {
    const stepDebug: StepDebugInfo = {
      agent: step.agent,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      guardrails: {},
    };
    // ... 실행 + 수집
    debugInfo.steps.push(stepDebug);
  }

  // 디버그 블록을 결과 앞에 추가
  const debugBlocks = formatDebugBlocks(debugInfo);
  await responseChannel.sendDebug(debugBlocks);
}
```

## 2. Explain 모드 (`explain:` prefix)

`explain:`은 **사용자 친화적** 설명. debug보다 간단:

```
사용자: "explain: 앱 123의 DAU"

에이전트 응답:
─────────────────────────────
💡 이렇게 조회했습니다:
  • "DAU"를 일일 활성 사용자 수(Daily Active Users)로 이해했습니다
  • 기간: 최근 7일 (기본값)
  • 테이블: airflux.events에서 user_id 고유 카운트
  • 필터: app_id = 123

📊 [일반 응답 결과]
─────────────────────────────
```

## 3. Distributed Tracing

### Trace ID 전파

Montgomery 패턴: 요청 → Gateway → Worker → Agent 전체에 traceId 전파.

```
Slack 요청 수신 (traceId 생성)
  ↓ traceId: "abc-123"
Gateway Lambda (로깅: gateway, traceId)
  ↓ Lambda invoke payload에 traceId 포함
Worker Lambda (로깅: worker, traceId)
  ↓ AgentContext.traceId
Router Agent (로깅: router, traceId)
  ↓
SQL Agent (로깅: sql-agent, traceId)
  ↓
Snowflake (로깅: snowflake, traceId, query_tag)
```

```typescript
// Snowflake 쿼리에도 traceId 태깅
async function executeWithTrace(sql: string, traceId: string): Promise<any> {
  await snowflake.execute(`ALTER SESSION SET QUERY_TAG = '${traceId}'`);
  return await snowflake.execute(sql);
}

// CloudWatch에서 traceId로 전체 흐름 추적
// fields @timestamp, component, event, metadata | filter traceId = 'abc-123' | sort @timestamp
```

### API 응답에 Trace ID 포함

```typescript
// REST API: 모든 응답 헤더에 traceId
res.headers.set('X-Airflux-Trace-Id', context.traceId);

// Slack: 메시지 하단에 (디버그 모드일 때만)
// 🔗 Trace: abc-123

// 에러 메시지에는 항상 포함
// ❌ 처리 중 오류 | 코드: SQL-EXEC-001 | Trace: abc-123
```

## 4. 로그 검색 패턴

### 특정 요청 전체 추적

```sql
-- CloudWatch Logs Insights
fields @timestamp, component, event, level, metadata
| filter traceId = 'abc-123'
| sort @timestamp asc
```

출력 예:
```
09:00:01 gateway    request_received     info  {source: 'slack', userId: 'U123'}
09:00:01 gateway    slack_verified       info  {valid: true}
09:00:01 gateway    worker_invoked       info  {eventType: 'query'}
09:00:02 worker     agent_started        info  {question: '앱 123의 DAU'}
09:00:02 router     route_decided        info  {agents: ['sql'], confidence: 'high'}
09:00:02 sql-agent  sql_generated        info  {sql: 'SELECT...', tables: ['events']}
09:00:02 guardrails guardrail_passed     info  {all: 'pass'}
09:00:03 snowflake  query_executed       info  {rows: 7, duration: 1200}
09:00:03 sql-agent  result_interpreted   info  {tokensUsed: 300}
09:00:04 worker     response_sent        info  {blocks: 8, latencyMs: 2340}
```

### 실패 패턴 분석

```sql
-- 최근 24시간 에러 유형별 집계
fields metadata.errorCode, metadata.agent, @message
| filter level = 'error' AND @timestamp > ago(24h)
| stats count(*) as errorCount by metadata.errorCode, metadata.agent
| sort errorCount desc
```

### 느린 쿼리 탐지

```sql
-- p95 > 10초인 요청
fields traceId, metadata.latencyMs, metadata.agent, metadata.question
| filter event = 'agent_execution' AND metadata.latencyMs > 10000
| sort metadata.latencyMs desc
| limit 20
```

## 5. 프로덕션 디버깅 도구

### 5.1 Slack에서 직접 디버깅

```
/airflux debug: 앱 123의 DAU        → 디버그 모드 (개발자용)
/airflux explain: 앱 123의 DAU      → 설명 모드 (사용자용)
/airflux trace abc-123               → trace ID로 이전 요청 조회 (향후)
/airflux status                      → 시스템 상태 (에이전트 상태, 에러율)
```

### 5.2 시스템 상태 조회

```
/airflux status

🤖 Airflux Agent Status
├── Router:  ✅ 활성 (haiku-4.5, p95: 200ms)
├── SQL:     ✅ 활성 (sonnet-4.6, p95: 3.2s)
├── Insight: ✅ 활성 (sonnet-4.6, p95: 5.1s)
├── Image:   ⚠️ 활성 (fallback: gpt-5.4, 에러율 12%)
│
├── 오늘 요청: 156건
├── 오늘 비용: $12.34 / $200 (6%)
├── 에러율: 2.1%
├── 평균 지연: 3.8초
│
└── Golden Dataset: 95.2% (어제: 96.0%, -0.8%)
```

## 6. 설계 결정 이유

| 결정 | 이유 |
|------|------|
| debug vs explain 분리 | 개발자(상세)와 사용자(간결)의 니즈가 다름 |
| Snowflake QUERY_TAG | DB 쪽에서도 traceId로 쿼리 추적 가능 |
| 에러 메시지에 traceId 항상 포함 | 사용자가 보고 시 즉시 추적 가능 |
| /status 명령 | 대시보드 없이도 Slack에서 빠른 상태 확인 |
