# Agent Data Protocol & Feedback Loop

> 에이전트 간 데이터 전달, 사용자 피드백 수집, 학습 루프

## 1. 에이전트 간 데이터 전달 프로토콜

### 문제

Orchestrator가 SQL Agent → Insight Agent → Image Agent를 순차 실행할 때,
각 에이전트의 출력을 다음 에이전트의 입력으로 **구조적으로** 전달해야 한다.

### Montgomery 패턴

Montgomery에서 데이터 전달은 두 가지 방식:
1. **AsyncProcessorPayload**: 슬래시 커맨드 → 프로세서 (JSON 직렬화된 페이로드)
2. **private_metadata**: /dj 멀티스텝 (Slack 모달 메타데이터에 JSON 인코딩)

두 방식 모두 **JSON 직렬화 가능한 구조체**를 사용하며, 타입으로 라우팅한다.

### Airflux 설계: StepResult 프로토콜

```typescript
/**
 * 모든 에이전트의 출력은 StepResult 형태.
 * 다음 에이전트는 이전 StepResult를 입력으로 받는다.
 */
interface StepResult {
  agent: string;               // 'sql' | 'insight' | 'image'
  status: 'success' | 'partial' | 'error';

  // 구조화된 데이터 (다음 에이전트가 파싱 가능)
  data?: {
    sql?: string;              // SQL Agent가 생성/실행한 SQL
    rows?: any[][];            // 쿼리 결과 행
    headers?: string[];        // 컬럼 헤더
    rowCount?: number;
    anomalies?: Anomaly[];     // Insight Agent가 발견한 이상치
    trends?: Trend[];          // 추이 분석 결과
    chartUrl?: string;         // Image Agent가 생성한 차트 URL
    mermaid?: string;          // 다이어그램 문법
  };

  // 자연어 요약 (사용자 표시용 + 다음 에이전트 컨텍스트용)
  summary: string;

  // 메타데이터
  metadata: {
    model: string;
    latencyMs: number;
    costUsd: number;
    tokensUsed: { input: number; output: number };
  };
}

interface Anomaly {
  date: string;
  value: number;
  expected: number;
  zscore: number;
  direction: 'spike' | 'drop';
  severity: 'critical' | 'warning' | 'info';
}

interface Trend {
  metric: string;
  direction: 'up' | 'down' | 'stable';
  changePercent: number;
  period: string;
}
```

### Orchestrator 데이터 흐름

```
사용자: "지난 주 이벤트 추이 분석하고 이상치가 있으면 차트로 보여줘"
  ↓
Router → Orchestration Plan: [sql, insight, image(conditional)]
  ↓
Step 1: SQL Agent
  input: "지난 주 이벤트 추이"
  output: StepResult { agent: 'sql', data: { rows, headers, sql }, summary: "..." }
  ↓
Step 2: Insight Agent
  input: 이전 StepResult + 원래 질문
  output: StepResult { agent: 'insight', data: { anomalies, trends }, summary: "..." }
  ↓
Step 3: Image Agent (조건부: anomalies.length > 0)
  input: 이전 StepResults + 원래 질문
  output: StepResult { agent: 'image', data: { chartUrl }, summary: "..." }
  ↓
Result Merger: 모든 StepResult 조합 → 최종 AgentResult
```

```typescript
// Orchestrator 내부
async function executeStep(
  step: OrchestrationStep,
  previousResults: Map<string, StepResult>,
  originalQuestion: string,
): Promise<StepResult> {
  const agent = AgentRegistry.get(step.agent);

  // 이전 결과를 컨텍스트로 주입
  const context = buildStepContext(step, previousResults, originalQuestion);

  // 에이전트 실행 — AI SDK 6 Agent의 generate/stream
  const result = await agent.execute(context);

  return result;
}

function buildStepContext(
  step: OrchestrationStep,
  previousResults: Map<string, StepResult>,
  originalQuestion: string,
): AgentContext {
  // 의존하는 이전 단계 결과를 주입
  const dependencies = (step.dependsOn || [])
    .map(dep => previousResults.get(dep))
    .filter(Boolean);

  // 이전 결과의 data + summary를 컨텍스트로 구성
  const previousContext = dependencies
    .map(r => `[${r.agent} 결과]\n${r.summary}\n데이터: ${JSON.stringify(r.data)}`)
    .join('\n\n');

  return {
    question: `${originalQuestion}\n\n이전 분석 결과:\n${previousContext}`,
    // ... 기타 AgentContext 필드
  };
}
```

### Result Merger

```typescript
function mergeStepResults(
  results: Map<string, StepResult>,
  originalQuestion: string,
): AgentResult {
  const sqlResult = results.get('sql');
  const insightResult = results.get('insight');
  const imageResult = results.get('image');

  return {
    // 최종 요약: 마지막 에이전트의 summary 사용
    summary: (insightResult || sqlResult)?.summary || '',

    // 데이터 테이블: SQL 결과
    dataTable: sqlResult?.data ? {
      headers: sqlResult.data.headers!,
      rows: sqlResult.data.rows!,
    } : undefined,

    // 인사이트: Insight 결과
    insights: insightResult?.data?.anomalies?.map(a =>
      `${a.date}: ${a.direction === 'spike' ? '급증' : '급감'} (Z-score: ${a.zscore.toFixed(1)})`
    ),

    // 차트: Image 결과
    chart: imageResult?.data?.chartUrl ? {
      type: 'url',
      data: imageResult.data.chartUrl,
      title: '추이 차트',
    } : undefined,

    // SQL 투명성
    sql: sqlResult?.data?.sql,

    // 후속 질문 제안
    followUpSuggestions: generateFollowUps(results),

    // 메타데이터: 모든 단계 합산
    metadata: {
      agentType: Array.from(results.keys()).join('+'),
      model: Array.from(results.values()).map(r => r.metadata.model).join(', '),
      latencyMs: sum(results, r => r.metadata.latencyMs),
      costUsd: sum(results, r => r.metadata.costUsd),
      traceId: results.values().next().value.metadata.traceId,
      cached: false,
    },
  };
}
```

---

## 1.5 에러 전파 & Graceful Degradation

### 문제

Orchestrator가 SQL → Insight → Image를 실행할 때:
- SQL Agent가 실패하면? Insight/Image도 실행 불가.
- Insight Agent만 실패하면? SQL 결과는 보여줄 수 있음.
- Image Agent만 실패하면? 텍스트 분석은 보여줄 수 있음.

### 전략: Partial Success + 사용자 알림

```typescript
type StepStatus = 'success' | 'partial' | 'skipped' | 'failed';

interface OrchestrationResult {
  overallStatus: 'success' | 'partial' | 'failed';
  steps: Map<string, { result?: StepResult; status: StepStatus; error?: string }>;
  userMessage: string;  // 사용자에게 보여줄 상태 설명
}

async function executeOrchestrationWithRecovery(
  plan: OrchestrationPlan,
  context: AgentContext,
  responseChannel: ResponseChannel,
): Promise<OrchestrationResult> {
  const steps = new Map<string, { result?: StepResult; status: StepStatus; error?: string }>();
  let hasAnySuccess = false;

  for (const step of plan.steps) {
    // 의존성 확인: 필수 의존 단계가 실패했으면 skip
    if (step.dependsOn?.some(dep => steps.get(dep)?.status === 'failed')) {
      const failedDep = step.dependsOn.find(dep => steps.get(dep)?.status === 'failed');
      steps.set(step.agent, {
        status: 'skipped',
        error: `${failedDep} 단계 실패로 건너뜀`,
      });
      await responseChannel.sendProgress(`⏭️ ${step.agent} 건너뜀 (${failedDep} 실패)`);
      continue;
    }

    try {
      await responseChannel.sendProgress(`🔄 ${step.agent} 실행 중...`);
      const result = await executeStep(step, steps, context.question);
      steps.set(step.agent, { result, status: 'success' });
      hasAnySuccess = true;
    } catch (error) {
      const isOptional = step.condition !== undefined;  // 조건부 단계는 선택적
      steps.set(step.agent, {
        status: isOptional ? 'skipped' : 'failed',
        error: error instanceof AirfluxError ? error.userMessage : String(error),
      });

      if (!isOptional) {
        await responseChannel.sendProgress(`⚠️ ${step.agent} 실패 — 계속 진행`);
      }
    }
  }

  // 결과 조합
  const overallStatus = hasAnySuccess ?
    (steps.size === Array.from(steps.values()).filter(s => s.status === 'success').length ? 'success' : 'partial')
    : 'failed';

  return {
    overallStatus,
    steps,
    userMessage: buildStatusMessage(steps),
  };
}

function buildStatusMessage(steps: Map<string, any>): string {
  const failed = Array.from(steps.entries()).filter(([_, s]) => s.status === 'failed');
  if (failed.length === 0) return '';
  return `\n⚠️ 일부 분석이 완료되지 않았습니다: ${failed.map(([name, s]) => `${name} (${s.error})`).join(', ')}`;
}
```

### 에러 유형별 대응

| 에러 | 단계 | 대응 |
|------|------|------|
| SQL 생성 실패 | SQL Agent | 전체 실패 → 사용자에게 질문 수정 요청 |
| SQL 실행 타임아웃 | SQL Agent | 전체 실패 → "범위를 좁혀주세요" |
| Insight Agent LLM 에러 | Insight | **partial** → SQL 결과만 표시 + "인사이트 생성 실패" 알림 |
| Image 생성 실패 | Image | **partial** → 텍스트 분석만 표시 + "차트 생성 실패" 알림 |
| Router 분류 실패 | Router | SQL Agent로 fallback (가장 일반적인 의도) |
| Rate limit (LLM) | 모든 | 재시도 (exponential backoff, 최대 3회) |
| Daily budget 초과 | 모든 | 즉시 중단 → AUTH-BUDGET-001 |

### ResponseChannel 에러 표시

```typescript
// Partial success 시 응답 포맷
// ─────────────────────────
// [SQL 결과 테이블]
// [실행 SQL]
// ⚠️ 인사이트 분석이 완료되지 않았습니다 (LLM 서비스 일시 오류)
// ⚠️ 차트 생성이 완료되지 않았습니다 (이미지 생성 실패)
// 💡 다시 시도하려면: "다시 분석해줘"
// ─────────────────────────
```

---

## 2. 사용자 피드백 루프

### Montgomery 패턴

Montgomery는 `agent_feedback_` prefix로 피드백 버튼을 감지하여 agent-api로 프록시한다.
이모지 반응도 피드백의 일종 (thought_balloon → 진행중, checkmark → 완료, x → 에러).

### Airflux 피드백 시스템

```
응답 메시지
  ├── 👍 도움이 됐어요 (positive)
  ├── 👎 아닌 것 같아요 (negative)
  ├── 📝 피드백 남기기 (detailed, 모달)
  └── 🔄 다시 해줘 (retry)
```

### 2.1 피드백 수집

```typescript
// ResponseFormatter에 피드백 버튼 추가
function addFeedbackButtons(blocks: any[], queryId: string): void {
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: '👍' },
        action_id: `airflux_feedback_positive_${queryId}`,
        value: JSON.stringify({ queryId, rating: 'positive' }),
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '👎' },
        action_id: `airflux_feedback_negative_${queryId}`,
        value: JSON.stringify({ queryId, rating: 'negative' }),
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '📝 피드백' },
        action_id: `airflux_feedback_detailed_${queryId}`,
        value: JSON.stringify({ queryId }),
      },
    ],
  });
}
```

### 2.2 피드백 저장

```typescript
interface FeedbackRecord {
  queryId: string;
  timestamp: number;
  userId: string;
  rating: 'positive' | 'negative';
  detailedFeedback?: string;   // 모달에서 입력

  // 재현을 위한 컨텍스트
  originalQuestion: string;
  routerDecision: string;
  agentsUsed: string[];
  generatedSql?: string;
  model: string;
  promptVersion: string;

  // A/B test 정보
  experimentVariant?: string;
}

// 피드백 저장 + 분석 트리거
async function handleFeedback(feedback: FeedbackRecord): Promise<void> {
  // 1. 저장 (S3 + CloudWatch)
  await saveFeedback(feedback);
  logger.info('user_feedback', feedback);

  // 2. Negative 피드백 시 자동 분석
  if (feedback.rating === 'negative') {
    // Golden dataset 후보로 마킹
    await markAsGoldenCandidate(feedback);

    // 연속 negative 감지 (같은 에이전트, 같은 시간대)
    const recentNegatives = await getRecentNegatives(feedback.agentsUsed[0], 1);
    if (recentNegatives.length >= 3) {
      await alertHighNegativeRate({
        agent: feedback.agentsUsed[0],
        count: recentNegatives.length,
        period: '1h',
      });
    }
  }
}
```

### 2.3 피드백 → 품질 개선 루프

```
피드백 수집
  ↓
분류 (positive/negative/detailed)
  ↓
Negative 분석
  ├── Golden dataset 후보 추가 (수동 검증 후 확정)
  ├── 연속 negative 알림 (drift 징후)
  └── 라우팅 오류 분석 (Router 개선 재료)
  ↓
Positive 분석
  ├── Few-shot 예시 후보 (높은 confidence + positive)
  ├── 프롬프트 효과 확인 (A/B test 지표)
  └── 에이전트별 성공 패턴 축적
  ↓
주간 리뷰 (Cron)
  ├── 피드백 요약 리포트
  ├── Golden dataset 검증 대기 목록
  ├── Few-shot 추가 후보 목록
  └── 프롬프트 개선 제안
```

### 2.4 자동 Few-shot 축적

```typescript
// Positive 피드백 + 높은 confidence → few-shot 후보
async function maybeAddFewShot(feedback: FeedbackRecord): Promise<void> {
  if (feedback.rating !== 'positive') return;

  // 조건: positive + confidence=high + 단일 에이전트 (복합 제외)
  const queryLog = await getQueryLog(feedback.queryId);
  if (queryLog.confidence !== 'high') return;
  if (queryLog.agentsUsed.length > 1) return;

  const candidate: FewShotCandidate = {
    question: feedback.originalQuestion,
    route: queryLog.routerDecision,
    sql: queryLog.generatedSql,
    verified: false,            // 수동 검증 필요
    source: 'user_feedback',
    added: new Date().toISOString(),
  };

  await appendToFewShotCandidates(candidate);
}
```

---

## 3. 재시도 & 자가 수정

### 3.1 SQL 자가 수정 패턴

SQL 실행 에러 시 에이전트가 스스로 수정 시도:

```typescript
// SQL Agent 내부 — AI SDK 6의 multi-step으로 자연스럽게 구현
const sqlAgent = new Agent({
  model: config.model,
  tools: {
    executeQuery: {
      description: 'Snowflake SQL 실행. 에러 시 에러 메시지가 반환됨.',
      inputSchema: z.object({ sql: z.string() }),
      execute: async ({ sql }) => {
        const guardrailResult = await validateSql(sql);
        if (!guardrailResult.pass) {
          // 에러 메시지를 반환 → Agent가 다음 step에서 수정 시도
          return { error: guardrailResult.reason, suggestion: guardrailResult.suggestion };
        }
        try {
          return await snowflake.execute(sql);
        } catch (err) {
          // DB 에러도 반환 → Agent가 수정
          return { error: err.message, sql };
        }
      },
    },
  },
  // maxSteps 내에서 자가 수정 허용
  stopWhen: stepCountIs(5),
});
```

Agent가 tool의 에러 응답을 받으면 자동으로 다음 step에서 수정된 SQL을 시도.
5회 내로 성공하지 못하면 사용자에게 에러 보고.

### 3.2 Router 자가 수정

Router가 잘못된 에이전트를 선택한 경우:

```typescript
// Orchestrator에서 에이전트 실행 실패 시 대체 경로 시도
async function executeWithFallback(
  plan: OrchestrationPlan,
  context: AgentContext,
): Promise<AgentResult> {
  try {
    return await executeOrchestration(plan, context);
  } catch (error) {
    // 특정 에이전트 실패 시, 해당 에이전트를 제외하고 재시도
    if (error instanceof AgentExecutionError) {
      const fallbackPlan = removeFailed(plan, error.agentName);
      if (fallbackPlan.steps.length > 0) {
        logger.warn('orchestration_fallback', {
          failed: error.agentName,
          remaining: fallbackPlan.steps.map(s => s.agent),
        });
        return await executeOrchestration(fallbackPlan, context);
      }
    }
    throw error;
  }
}
```

---

## 4. 설계 결정 이유

| 결정 | 이유 |
|------|------|
| StepResult 구조체 | JSON 직렬화 가능 → DurableAgent에서 step 간 상태 전달 가능 |
| data + summary 분리 | 다음 에이전트는 data(구조화)를 파싱, 사용자는 summary를 봄 |
| 피드백 prefix 패턴 | Montgomery `agent_feedback_` 패턴 검증됨 — Slack action routing에 최적 |
| 자동 few-shot 축적 | 수동 큐레이션만으로는 확장 불가 — 자동 수집 + 수동 검증 하이브리드 |
| SQL 자가 수정 | AI SDK 6 Agent의 multi-step이 자연스럽게 지원 — tool 에러를 반환하면 Agent가 재시도 |
| private_metadata 대신 Redis | Montgomery는 Slack UI에 상태를 저장했으나, Airflux는 멀티 엔드포인트이므로 Redis 필수 |
