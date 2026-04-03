# Testing Strategy

> 단위/통합/E2E/평가 테스트의 전체 구조

## 1. 테스트 피라미드

```
        ╱╲
       ╱  ╲        Evaluation (Golden Dataset)
      ╱ 10 ╲       — 매일 Cron, 배포 시 자동
     ╱──────╲
    ╱        ╲      E2E Integration
   ╱   15     ╲    — Slack/API 엔드포인트 → Agent → 응답
  ╱────────────╲
 ╱              ╲    Unit Tests
╱      60+       ╲  — Guardrails, Parser, Formatter, Config
╱────────────────────╲
```

## 2. Unit Tests (60+)

### 2.1 Guardrails (18개, 기존)

```typescript
// tests/unit/guardrails.test.ts
describe('read-only guard', () => {
  it('blocks INSERT/UPDATE/DELETE/DROP');
  it('allows CREATED_AT (false positive 방지)');
});
describe('pii-filter guard', () => {
  it('blocks direct EMAIL access');
  it('allows COUNT(DISTINCT email)');
});
// ... 5개 guardrail × 3-4 케이스
```

### 2.2 Prefix Parser (9개, 기존)

```typescript
// tests/unit/prefix-parser.test.ts
it('parses debug: prefix');
it('parses explain: prefix');
it('ignores "debugging" (false positive)');
```

### 2.3 신규 추가 대상

```typescript
// tests/unit/agent-registry.test.ts
describe('AgentRegistry', () => {
  it('loads enabled agents from config');
  it('skips disabled agents');
  it('respects feature flags');
  it('filters by source (slack/api/cron)');
  it('returns fallback model on high error rate');
});

// tests/unit/router.test.ts
describe('Router Agent', () => {
  it('routes "이벤트 수 알려줘" to sql');
  it('routes "왜 줄었어?" to insight');
  it('routes "차트 그려줘" to image');
  it('routes complex to multi-agent');
  it('asks clarification for ambiguous');
});

// tests/unit/orchestrator.test.ts
describe('Orchestrator', () => {
  it('executes sequential steps');
  it('skips step when dependency failed');
  it('returns partial result on optional step failure');
  it('respects conditional steps');
});

// tests/unit/response-channel.test.ts
describe('SlackResponseChannel', () => {
  it('formats within 50 block limit');
  it('overflows to S3 for large results');
  it('includes feedback buttons');
});
describe('HttpResponseChannel', () => {
  it('streams SSE events');
  it('sends complete event at end');
});

// tests/unit/session-state.test.ts
describe('SessionState', () => {
  it('creates new session');
  it('expires after 30 minutes');
  it('tracks question history');
  it('prevents duplicate warnings');
});

// tests/unit/cost-tracker.test.ts
describe('CostTracker', () => {
  it('blocks request when daily budget exceeded');
  it('alerts at 80% budget');
});

// tests/unit/pii-masking.test.ts
describe('PII Masking', () => {
  it('masks email addresses');
  it('masks Korean phone numbers');
  it('masks IP addresses');
  it('does not mask normal text');
});

// tests/unit/config-loader.test.ts (기존 확장)
describe('Config Loader', () => {
  it('caches for 5 minutes');
  it('reloads after TTL');
  it('handles missing file gracefully');
});
```

## 3. Integration Tests (15개)

Mock LLM + 실제 설정 파일로 전체 파이프라인 테스트:

```typescript
// tests/integration/slack-flow.test.ts
describe('Slack → Agent → Response flow', () => {
  it('slash command → SQL Agent → Slack blocks', async () => {
    const event = createSlackSlashEvent('/airflux 앱 123의 DAU');
    const response = await gateway.handler(event);
    // Worker가 invoke 됨을 확인
    expect(mockLambdaInvoke).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'query' })
    );
  });

  it('mention → Router → SQL Agent → thread reply', async () => {
    const event = createSlackMentionEvent('@airflux 이벤트 수 알려줘');
    await eventHandler.handler(event);
    expect(mockSlackPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ thread_ts: expect.any(String) })
    );
  });

  it('handles Slack retry (x-slack-retry-num) by returning 200', async () => {
    const event = createSlackEvent({ headers: { 'x-slack-retry-num': '1' } });
    const response = await gateway.handler(event);
    expect(response.statusCode).toBe(200);
  });
});

// tests/integration/api-flow.test.ts
describe('API → Agent → JSON response', () => {
  it('POST /api/query returns JSON result');
  it('POST /api/query/stream returns SSE events');
  it('rejects unauthenticated requests');
});

// tests/integration/orchestration-flow.test.ts
describe('Multi-agent orchestration', () => {
  it('SQL → Insight pipeline produces merged result');
  it('partial failure returns partial result with warning');
});
```

## 4. Golden Dataset Evaluation

상세: `capabilities/06-evaluation-observability.md` 참조.

```typescript
// tests/eval/golden.test.ts
// CI에서 실행: npm run eval
describe('Golden Dataset Evaluation', () => {
  const dataset = loadGoldenDataset();

  for (const testCase of dataset) {
    it(`[${testCase.id}] ${testCase.question}`, async () => {
      const result = await evaluateTestCase(testCase);

      // 라우팅 정확성
      if (testCase.expectedRoute) {
        expect(result.actualRoute).toEqual(testCase.expectedRoute);
      }

      // SQL 패턴 매칭
      if (testCase.sqlPattern) {
        expect(result.sqlGenerated).toMatch(new RegExp(testCase.sqlPattern, 'i'));
      }

      // Guardrail 트리거
      if (testCase.expectedGuardrail) {
        expect(result.guardrailTriggered).toBe(testCase.expectedGuardrail);
      }

      // 응답 패턴
      if (testCase.answerPattern) {
        expect(result.answer).toMatch(new RegExp(testCase.answerPattern));
      }
    });
  }
});
```

## 5. 테스트 실행

```bash
# 단위 테스트 (빠름, CI 필수)
npx vitest run tests/unit/

# 통합 테스트 (Mock LLM, CI 필수)
npx vitest run tests/integration/

# Golden Dataset 평가 (실제 LLM 호출, 비용 발생)
npm run eval                          # 전체
npm run eval -- --category safety     # 특정 카테고리만
npm run eval -- --id GD-001           # 특정 케이스만

# 커버리지
npx vitest run --coverage
```

## 6. CI/CD 통합

```yaml
# .github/workflows/ci.yaml
jobs:
  test:
    steps:
      - run: npx vitest run tests/unit/          # 항상
      - run: npx vitest run tests/integration/   # 항상

  eval:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - run: npm run eval -- --category safety   # main 머지 시 safety만
      # safety 실패 시 배포 차단

  deploy:
    needs: [test, eval]
    steps:
      - run: npx sst deploy --stage production
```

## 7. Mock 전략

| 대상 | Mock 방식 | 사용 위치 |
|------|----------|----------|
| LLM (Claude/GPT) | 고정 응답 반환 | Unit, Integration |
| Snowflake | Mock 결과셋 | Unit, Integration |
| Slack API | Mock WebClient | Unit, Integration |
| Redis | In-memory Map | Unit |
| S3 | Mock 업로드 함수 | Unit |
| AI Gateway | — (실제 호출) | Golden Dataset Eval만 |
