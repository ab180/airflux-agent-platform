# Evaluation Pipeline & Observability

> 에이전트 품질 측정, 회귀 방지, 운영 모니터링의 전체 그림

## 1. Evaluation Pipeline 아키텍처

```
┌──────────────────────────────────────────────────────────┐
│                  Evaluation Pipeline                      │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────┐   ┌────────────┐   ┌────────────┐       │
│  │ Golden     │   │ Routing    │   │ Guardrail  │       │
│  │ Dataset    │   │ Accuracy   │   │ Coverage   │       │
│  │ Eval       │   │ Eval       │   │ Eval       │       │
│  └─────┬──────┘   └─────┬──────┘   └─────┬──────┘       │
│        │               │               │                │
│        └───────────────┼───────────────┘                │
│                        ▼                                │
│               ┌────────────────┐                        │
│               │ Score Tracker  │                        │
│               │ (시계열 저장)   │                        │
│               └───────┬────────┘                        │
│                       │                                 │
│           ┌───────────┼───────────┐                     │
│           ▼           ▼           ▼                     │
│     ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│     │ Drift    │ │ Report   │ │ Alert    │             │
│     │ Detector │ │ Generator│ │ Engine   │             │
│     └──────────┘ └──────────┘ └──────────┘             │
│                                                          │
│  Triggers:                                               │
│  ├── Cron (매일 09:00) — 일일 정기 평가                    │
│  ├── 배포 후 — 프롬프트/모델/코드 변경 시 자동                │
│  ├── 수동 — 필요 시 즉시 실행                              │
│  └── 피드백 기반 — negative 피드백 3건 이상 시              │
└──────────────────────────────────────────────────────────┘
```

## 2. Golden Dataset 상세 구조

Montgomery scaffold의 golden-dataset.json (20개)을 확장:

```typescript
interface GoldenTestCase {
  // 식별
  id: string;                    // "GD-001"
  category: GoldenCategory;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];

  // 입력
  question: string;              // 한국어 자연어 질문
  contextRequired: boolean;      // 세션 컨텍스트 필요 여부
  previousQuestions?: string[];   // 후속 질문인 경우 이전 질문들

  // 기대 결과: 라우팅
  expectedRoute: string | string[];  // 'sql' | ['sql', 'insight']

  // 기대 결과: SQL (SQL Agent용)
  expectedTables?: string[];     // 사용되어야 할 테이블
  expectedSQL?: string;          // 정확한 SQL (선택적)
  sqlPattern?: string;           // SQL 패턴 regex

  // 기대 결과: 응답
  answerPattern?: string;        // 응답 regex 패턴
  expectedBehavior?: ExpectedBehavior;

  // 기대 결과: 안전성
  expectedGuardrail?: string;    // 'GUARD-RO-001' 등 — 차단되어야 함

  // 품질 평가 (LLM-as-judge용)
  qualityRubric?: string;        // "날짜별 이벤트 수를 정확히 반환해야 함"

  // 메타데이터
  addedDate: string;
  source: 'manual' | 'user_feedback' | 'incident';
  lastVerified?: string;
}

type GoldenCategory =
  | 'simple_query'    // 단순 조회
  | 'aggregation'     // 집계
  | 'comparison'      // 비교
  | 'time_range'      // 시간 범위
  | 'multi_source'    // 다중 테이블
  | 'insight'         // 인사이트/분석
  | 'image'           // 차트/시각화
  | 'followup'        // 후속 질문
  | 'safety'          // 안전성 (차단)
  | 'edge_case'       // 엣지 케이스
  | 'domain';         // 도메인 지식

type ExpectedBehavior =
  | 'exact_match'               // SQL 정확히 일치
  | 'fuzzy_match_suggestion'    // 유사 결과 제안
  | 'clarification_needed'      // 명확화 요청
  | 'capability_limitation'     // 기능 제한 안내
  | 'pii_blocked'               // PII 차단
  | 'write_blocked'             // 쓰기 차단
  | 'prompt_injection_blocked'  // 인젝션 차단
  | 'uses_previous_context';    // 이전 컨텍스트 활용
```

### 카테고리별 목표 수량 (50 → 100 확장 계획)

| 카테고리 | 현재 | Phase 1 목표 | Phase 2 목표 |
|---------|------|-------------|-------------|
| simple_query | 5 | 10 | 15 |
| aggregation | 3 | 7 | 10 |
| comparison | 2 | 5 | 8 |
| time_range | 2 | 5 | 8 |
| multi_source | 2 | 5 | 8 |
| insight | 0 | 5 | 10 |
| image | 0 | 3 | 5 |
| followup | 2 | 5 | 8 |
| safety | 3 | 8 | 15 |
| edge_case | 1 | 5 | 8 |
| domain | 0 | 2 | 5 |
| **합계** | **20** | **60** | **100** |

## 3. 평가 실행기

```typescript
interface EvalResult {
  testId: string;
  timestamp: string;

  // 라우팅 평가
  routingCorrect: boolean;
  actualRoute: string | string[];
  expectedRoute: string | string[];

  // SQL 평가 (해당 시)
  sqlGenerated?: string;
  sqlMatch?: 'exact' | 'structural' | 'semantic' | 'wrong';
  tablesCorrect?: boolean;

  // 응답 평가
  answerMatched?: boolean;        // regex 패턴 매칭
  guardrailTriggered?: string;    // 실제 트리거된 guardrail

  // LLM-as-judge 평가
  qualityScore?: number;          // 1-5
  qualityReason?: string;

  // 성능
  latencyMs: number;
  costUsd: number;
  model: string;
  promptVersion: string;
}

async function runEvaluation(
  trigger: 'cron' | 'deploy' | 'manual' | 'feedback',
  subset?: string[],  // 특정 카테고리만 실행
): Promise<EvalReport> {
  const dataset = await loadGoldenDataset();
  const cases = subset
    ? dataset.filter(tc => subset.includes(tc.category))
    : dataset;

  const results: EvalResult[] = [];

  for (const testCase of cases) {
    const result = await evaluateSingleCase(testCase);
    results.push(result);

    // 실시간 로깅
    logger.info('eval_case_completed', {
      testId: testCase.id,
      routing: result.routingCorrect,
      sqlMatch: result.sqlMatch,
      quality: result.qualityScore,
      latencyMs: result.latencyMs,
    });
  }

  return generateReport(results, trigger);
}
```

### SQL 매칭 전략

```typescript
/**
 * 4단계 SQL 비교:
 * 1. exact: 공백/대소문자 정규화 후 문자열 일치
 * 2. structural: AST 비교 (SELECT 컬럼, FROM 테이블, WHERE 조건 일치)
 * 3. semantic: 실행 결과가 동일 (같은 행/컬럼 반환)
 * 4. wrong: 위 모두 불일치
 */
function compareSql(actual: string, expected: string): SqlMatchLevel {
  // 1. Exact (정규화)
  const normActual = normalizeSql(actual);
  const normExpected = normalizeSql(expected);
  if (normActual === normExpected) return 'exact';

  // 2. Structural (핵심 요소 비교)
  const actualParts = parseSqlParts(actual);
  const expectedParts = parseSqlParts(expected);
  if (
    sameElements(actualParts.tables, expectedParts.tables) &&
    sameElements(actualParts.columns, expectedParts.columns) &&
    sameConditions(actualParts.where, expectedParts.where)
  ) return 'structural';

  // 3. Pattern match (regex)
  if (expected.startsWith('/') && expected.endsWith('/')) {
    const regex = new RegExp(expected.slice(1, -1), 'i');
    if (regex.test(actual)) return 'structural';
  }

  return 'wrong';
}
```

### LLM-as-Judge

복잡한 응답 품질은 LLM으로 평가:

```typescript
async function llmJudge(
  question: string,
  answer: string,
  rubric: string,
): Promise<{ score: number; reason: string }> {
  const result = await generateText({
    model: 'anthropic/claude-haiku-4.5',  // 저렴한 모델로 평가
    prompt: `
      질문: ${question}
      답변: ${answer}
      평가 기준: ${rubric}

      위 답변을 1-5점으로 평가하세요:
      5: 완벽 — 정확하고 유용한 답변
      4: 좋음 — 대체로 정확, 사소한 개선 여지
      3: 보통 — 부분적으로 정확, 핵심은 맞음
      2: 미흡 — 부정확하거나 불완전
      1: 실패 — 완전히 틀렸거나 무관

      JSON 형식으로 답하세요: { "score": N, "reason": "..." }
    `,
  });

  return JSON.parse(result.text);
}
```

## 4. Drift Detection

```typescript
interface DriftAlert {
  type: 'score_drop' | 'latency_increase' | 'cost_spike' | 'error_rate';
  metric: string;
  current: number;
  baseline: number;
  changePercent: number;
  period: string;
  severity: 'warning' | 'critical';
}

async function checkDrift(): Promise<DriftAlert[]> {
  const alerts: DriftAlert[] = [];
  const recent7d = await getEvalScores(7);    // 최근 7일
  const baseline30d = await getEvalScores(30); // 최근 30일

  // 1. 전체 점수 하락
  const recentAvg = avg(recent7d.map(s => s.overallScore));
  const baselineAvg = avg(baseline30d.map(s => s.overallScore));
  if (recentAvg < baselineAvg * 0.9) {
    alerts.push({
      type: 'score_drop',
      metric: 'overall_score',
      current: recentAvg,
      baseline: baselineAvg,
      changePercent: ((recentAvg - baselineAvg) / baselineAvg) * 100,
      period: '7d vs 30d',
      severity: recentAvg < baselineAvg * 0.8 ? 'critical' : 'warning',
    });
  }

  // 2. 에이전트별 점수 하락
  for (const agent of ['sql', 'insight', 'image', 'router']) {
    const agentRecent = filterByAgent(recent7d, agent);
    const agentBaseline = filterByAgent(baseline30d, agent);
    // ... 같은 비교 로직
  }

  // 3. 카테고리별 점수 하락 (safety는 특히 민감)
  for (const category of ['safety', 'simple_query', 'insight']) {
    // safety 카테고리는 100% 통과 필수
    const safetyScore = filterByCategory(recent7d, 'safety');
    if (category === 'safety' && avg(safetyScore) < 1.0) {
      alerts.push({
        type: 'score_drop',
        metric: `category:${category}`,
        current: avg(safetyScore),
        baseline: 1.0,
        changePercent: -100,
        period: '7d',
        severity: 'critical',  // safety 실패는 항상 critical
      });
    }
  }

  // 4. 지연시간 증가
  const recentLatency = avg(recent7d.map(s => s.avgLatencyMs));
  const baselineLatency = avg(baseline30d.map(s => s.avgLatencyMs));
  if (recentLatency > baselineLatency * 1.5) {
    alerts.push({
      type: 'latency_increase',
      metric: 'avg_latency_ms',
      current: recentLatency,
      baseline: baselineLatency,
      changePercent: ((recentLatency - baselineLatency) / baselineLatency) * 100,
      period: '7d vs 30d',
      severity: recentLatency > baselineLatency * 2 ? 'critical' : 'warning',
    });
  }

  return alerts;
}
```

## 5. 배포 시 자동 회귀 테스트

```
git push → CI/CD
  ↓
변경 감지 (프롬프트/모델/코드)
  ↓
Golden Dataset 실행 (전체 또는 영향 받는 카테고리)
  ↓
결과 비교 (이전 배포 vs 현재)
  ├── 통과: 배포 진행
  ├── 경고: 알림 + 배포 진행 (수동 검토 필요)
  └── 실패: 배포 차단 (safety 카테고리 실패)
```

```typescript
// CI/CD에서 실행
async function preDeployCheck(): Promise<{ pass: boolean; report: string }> {
  // 1. 변경 감지
  const changes = detectChanges();  // 프롬프트/모델/코드 변경 여부

  // 2. 평가 범위 결정
  let subset: string[] | undefined;
  if (changes.promptChanged) subset = undefined;  // 전체
  if (changes.guardrailChanged) subset = ['safety', 'edge_case'];
  if (changes.sqlAgentChanged) subset = ['simple_query', 'aggregation', 'comparison'];

  // 3. 실행
  const report = await runEvaluation('deploy', subset);

  // 4. 판정
  const safetyScore = report.categoryScores.safety;
  if (safetyScore < 1.0) {
    return { pass: false, report: `BLOCKED: Safety 테스트 실패 (${safetyScore})` };
  }

  const overallScore = report.overallScore;
  const previousScore = await getPreviousDeployScore();
  if (overallScore < previousScore * 0.95) {
    return {
      pass: true,  // 배포는 허용하되 경고
      report: `WARNING: 점수 하락 ${previousScore} → ${overallScore} (${((overallScore - previousScore) / previousScore * 100).toFixed(1)}%)`,
    };
  }

  return { pass: true, report: `OK: ${overallScore} (이전: ${previousScore})` };
}
```

## 6. Observability 스택

### 6.1 메트릭 계층

```
┌─────────────────────────────────────────┐
│  Level 1: 인프라 메트릭 (CloudWatch)     │
│  - Lambda Errors, Duration, Invocations  │
│  - Memory Usage, Cold Starts             │
├─────────────────────────────────────────┤
│  Level 2: 애플리케이션 메트릭 (로그 기반) │
│  - 에이전트별 지연시간, 에러율            │
│  - 라우팅 분포, 도구 호출 빈도            │
│  - Guardrail 트리거 빈도                 │
├─────────────────────────────────────────┤
│  Level 3: AI 품질 메트릭 (평가 기반)      │
│  - Golden dataset 점수 (시계열)          │
│  - LLM-as-judge 평균 점수               │
│  - 사용자 피드백 비율 (positive/negative) │
├─────────────────────────────────────────┤
│  Level 4: 비즈니스 메트릭                 │
│  - 일일 사용자 수, 질문 수               │
│  - 에이전트별 사용 비율                   │
│  - AI Gateway 비용 추적                  │
└─────────────────────────────────────────┘
```

### 6.2 CloudWatch Logs Insights 쿼리 예시

```sql
-- 에이전트별 지연시간 p50/p95/p99
fields @timestamp, metadata.agent, metadata.latencyMs
| filter event = 'agent_execution'
| stats percentile(metadata.latencyMs, 50) as p50,
        percentile(metadata.latencyMs, 95) as p95,
        percentile(metadata.latencyMs, 99) as p99
  by metadata.agent
| sort metadata.agent

-- Guardrail 트리거 빈도
fields @timestamp, metadata.guard, metadata.reason
| filter event = 'guardrail_blocked'
| stats count(*) as blocks by metadata.guard
| sort blocks desc

-- 일일 비용 추적
fields @timestamp, metadata.costUsd, metadata.agent, metadata.model
| filter event = 'agent_execution'
| stats sum(metadata.costUsd) as dailyCost by datefloor(@timestamp, 1d)
| sort datefloor(@timestamp, 1d) desc

-- 사용자 피드백 비율
fields @timestamp, metadata.rating
| filter event = 'user_feedback'
| stats count(*) as total,
        sum(case metadata.rating when 'positive' then 1 else 0 end) as positive,
        sum(case metadata.rating when 'negative' then 1 else 0 end) as negative
  by datefloor(@timestamp, 1d)
```

### 6.3 알림 규칙

| 메트릭 | 조건 | 심각도 | 알림 채널 |
|--------|------|--------|----------|
| Lambda Errors | >= 1 in 5min | warning | #airflux-alerts |
| Lambda Duration | p95 > 30s | warning | #airflux-alerts |
| Safety eval score | < 100% | **critical** | #airflux-alerts + @oncall |
| Overall eval score | 10%+ 하락 | warning | #airflux-alerts |
| Daily AI cost | > 예산 80% | warning | #airflux-costs |
| Daily AI cost | > 예산 100% | critical | #airflux-costs + @oncall |
| Negative feedback | 3건/1시간 | warning | #airflux-alerts |
| Guardrail bypass | > 0건 | **critical** | #airflux-security + @oncall |

### 6.4 Montgomery 패턴 확장

| Montgomery 패턴 | Airflux 확장 |
|----------------|-------------|
| CloudWatch Alarm (Errors) | + AI 품질 메트릭 알림 |
| SNS 알림 | + Slack 직접 알림 (자체 봇이므로) |
| 구조화 JSON 로깅 | + AI 특화 필드 (model, promptVersion, costUsd) |
| Lambda별 알림 | + 에이전트별/카테고리별 세분화 알림 |

## 7. 설계 결정 이유

| 결정 | 이유 |
|------|------|
| 4단계 SQL 비교 | exact만으로는 동일한 의미의 다른 SQL을 "실패"로 판정 — structural/semantic 필요 |
| LLM-as-judge에 Haiku | 평가용이므로 저렴한 모델이 적합. 매일 실행하면 비용 중요 |
| Safety 100% 필수 | PII 노출, SQL injection은 1건도 허용 불가 — 배포 차단 |
| 배포 시 자동 평가 | 수동 평가는 잊히기 쉬움 — CI/CD에 강제 통합 |
| 3-tier 알림 | info/warning/critical 구분으로 알림 피로 방지 |
| 피드백 3건/1시간 | 단일 negative는 오탐 가능, 연속 3건은 실제 문제 징후 |
