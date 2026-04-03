# Agent Management & Operations

> 에이전트 생명주기, Router/Orchestrator, 툴 선택, 가이드라인 관리, 품질 보장

## 1. Agent Lifecycle Management

### 1.1 등록 모델: Code + Config 하이브리드

에이전트 자체는 **코드로 추가** (외부 라이브러리, 복잡한 로직 필요), 운용 파라미터는 **설정으로 제어**.

```
코드 (배포 필요)              설정 (런타임 제어)
├── 에이전트 클래스 정의       ├── 활성화/비활성화 (feature flag)
├── 도구(tool) 구현           ├── 모델 선택 (claude-sonnet vs haiku)
├── 외부 라이브러리 통합       ├── temperature, maxSteps 등 파라미터
└── 타입 정의                 ├── 프롬프트 버전 선택
                              ├── 라우팅 규칙/가중치
                              └── 비용 한도/rate limit

```

**Montgomery 영감**: CommandRegistry (코드로 등록) + settings/services.csv (설정으로 서비스 목록 관리)

### 1.2 AgentRegistry 확장

```typescript
// 현재: 정적 등록
AgentRegistry.register('sql', new SqlAgent());

// 확장: 설정 기반 파라미터 주입
interface AgentConfig {
  name: string;
  enabled: boolean;
  model: string;                    // 'anthropic/claude-sonnet-4.6'
  fallbackModel?: string;           // 'openai/gpt-5.4'
  maxSteps: number;
  temperature: number;
  costLimitPerRequest: number;      // USD
  dailyBudget: number;              // USD
  promptVersion: string;            // 'v2.1'
  allowedSources: ('slack' | 'api' | 'cron' | 'webhook')[];
  featureFlag?: string;             // feature flag 이름 연동
}

class AgentRegistry {
  private static agents = new Map<string, BaseAgent>();
  private static configs = new Map<string, AgentConfig>();

  // 코드로 에이전트 등록, 설정은 YAML에서 로드
  static async initialize() {
    if (this.initialized) return;

    // 1. 설정 로드
    const configs = await loadConfig<AgentConfig[]>('agents');

    // 2. 에이전트 코드 등록 (동적 import)
    const agentModules: Record<string, () => Promise<BaseAgent>> = {
      'sql': async () => (await import('../agents/sql-agent')).SqlAgent,
      'insight': async () => (await import('../agents/insight-agent')).InsightAgent,
      'image': async () => (await import('../agents/image-agent')).ImageAgent,
      'router': async () => (await import('../agents/router-agent')).RouterAgent,
    };

    // 3. 활성화된 에이전트만 등록
    for (const config of configs) {
      if (!config.enabled) continue;
      if (config.featureFlag && !isFeatureEnabled(config.featureFlag)) continue;

      const factory = agentModules[config.name];
      if (factory) {
        const AgentClass = await factory();
        const agent = new AgentClass(config);  // 설정 주입
        this.agents.set(config.name, agent);
        this.configs.set(config.name, config);
      }
    }

    this.initialized = true;
  }

  // 소스별 접근 제어
  static getForSource(name: string, source: string): BaseAgent | undefined {
    const config = this.configs.get(name);
    if (config && !config.allowedSources.includes(source as any)) return undefined;
    return this.agents.get(name);
  }
}
```

### 1.3 설정 파일

```yaml
# settings/agents.yaml
- name: router
  enabled: true
  model: anthropic/claude-haiku-4.5    # 빠르고 저렴
  maxSteps: 1
  temperature: 0
  costLimitPerRequest: 0.01
  dailyBudget: 5.0
  promptVersion: v1.0
  allowedSources: [slack, api, cron, webhook]

- name: sql
  enabled: true
  model: anthropic/claude-sonnet-4.6
  fallbackModel: openai/gpt-5.4
  maxSteps: 5
  temperature: 0
  costLimitPerRequest: 0.10
  dailyBudget: 50.0
  promptVersion: v2.1
  allowedSources: [slack, api, cron, webhook]

- name: insight
  enabled: true
  model: anthropic/claude-sonnet-4.6
  maxSteps: 8
  temperature: 0.3
  costLimitPerRequest: 0.20
  dailyBudget: 30.0
  promptVersion: v1.0
  allowedSources: [slack, api, cron]
  featureFlag: insight_agent        # feature flag 연동

- name: image
  enabled: true
  model: anthropic/claude-sonnet-4.6
  maxSteps: 3
  temperature: 0
  costLimitPerRequest: 0.15
  dailyBudget: 20.0
  promptVersion: v1.0
  allowedSources: [slack, api, cron]
  featureFlag: chart_generation
```

### 1.4 에이전트 장애 대응

```typescript
// AgentRegistry — fallback 모델 자동 전환
static async getWithFallback(name: string): Promise<{ agent: BaseAgent; usingFallback: boolean }> {
  const agent = this.agents.get(name);
  const config = this.configs.get(name);
  if (!agent || !config) throw new AirfluxError('LLM-API-001');

  // 주 모델 health check (최근 5분 에러율)
  const errorRate = await getRecentErrorRate(name, 5);
  if (errorRate > 0.5 && config.fallbackModel) {
    // fallback 모델로 전환
    logger.warn('agent_fallback_activated', {
      agent: name, primaryModel: config.model,
      fallbackModel: config.fallbackModel, errorRate,
    });
    const fallbackAgent = agent.withModel(config.fallbackModel);
    return { agent: fallbackAgent, usingFallback: true };
  }

  return { agent, usingFallback: false };
}
```

**비활성화된 에이전트 요청 시**:
- Router가 비활성 에이전트로 라우팅 시도 → `AgentRegistry.get()` 반환 없음
- Orchestrator가 해당 step을 skip하고 partial result 반환
- 사용자에게 "이 기능은 현재 비활성화되어 있습니다" 안내

---

## 2. Router + Orchestrator 설계

### 2.1 Router Agent

모든 요청은 Router Agent를 거친다. Router는 **항상** 의도를 분류한다.

```
모든 요청 → Router Agent
  ├── 단일 의도 (70%): 해당 Agent 직행
  ├── 복합 의도 (25%): Orchestrator에게 위임
  └── 불명확 (5%): 사용자에게 clarification 요청
```

**Router의 판단 기준 (3-layer)**:

```
Layer 1: 정적 프롬프트 (기본 instructions)
  "SQL 조회, 인사이트 분석, 차트 생성, 작업 자동화를 분류하세요"

Layer 2: YAML 라우팅 규칙 (런타임 튜닝)
  키워드 매핑, 예시 패턴, 에이전트별 설명

Layer 3: Few-shot 예시 (실사용 데이터 축적)
  실제 질문 → 라우팅 결과 쌍을 동적 주입
```

```yaml
# settings/routing-rules.yaml
agents:
  sql:
    description: "데이터 조회, 집계, 필터링, 숫자 확인"
    keywords: [조회, 몇개, 얼마, 수, 카운트, 리스트, 목록, 찾아, 알려줘]
    examples:
      - "앱 123의 지난 주 이벤트 수" → sql
      - "purchase 이벤트가 가장 많은 앱" → sql
      - "이 앱 SDK 버전 뭐야" → sql

  insight:
    description: "분석, 인사이트, 이상 탐지, 추이, 비교, 원인"
    keywords: [분석, 왜, 원인, 이상, 추이, 비교, 변화, 감소, 증가, 이유]
    examples:
      - "이벤트가 왜 줄었어?" → insight
      - "지난 주 대비 변화 분석" → insight
      - "이상한 앱 찾아줘" → insight

  image:
    description: "차트, 그래프, 시각화, 다이어그램"
    keywords: [차트, 그래프, 시각화, 그려, 보여줘, 다이어그램]
    examples:
      - "이벤트 추이 차트 그려줘" → image (+ sql 선행)
      - "앱별 비교 그래프" → image (+ sql 선행)

  multi:
    description: "복합 요청 — 여러 에이전트 필요"
    examples:
      - "지난 주 추이 분석하고 이상치가 있으면 차트로 보여줘" → [sql, insight, image]
      - "이 앱 상태 전체 진단해줘" → [sql, insight]
```

### 2.2 Orchestrator

복합 요청을 처리하는 Orchestrator:

```typescript
interface OrchestrationPlan {
  steps: OrchestrationStep[];
  strategy: 'sequential' | 'parallel' | 'conditional';
}

interface OrchestrationStep {
  agent: string;
  dependsOn?: string[];        // 이전 단계 결과를 입력으로 받음
  input: 'user_question' | 'previous_output' | 'merged';
  condition?: string;          // 조건부 실행 (e.g. "if anomalies_found")
}

// 예: "추이 분석하고 이상치 있으면 차트 그려줘"
const plan: OrchestrationPlan = {
  strategy: 'conditional',
  steps: [
    { agent: 'sql', input: 'user_question' },
    { agent: 'insight', input: 'previous_output', dependsOn: ['sql'] },
    { agent: 'image', input: 'previous_output', dependsOn: ['insight'],
      condition: 'insight.anomalies.length > 0' },
  ],
};

async function executeOrchestration(
  plan: OrchestrationPlan,
  context: AgentContext,
  responseChannel: ResponseChannel,
): Promise<AgentResult> {
  const results = new Map<string, AgentResult>();

  for (const step of plan.steps) {
    // 조건 확인
    if (step.condition && !evaluateCondition(step.condition, results)) {
      continue;
    }

    // 진행 상태 알림
    await responseChannel.sendProgress(`${step.agent} 에이전트 실행 중...`);

    // 입력 구성
    const input = step.input === 'user_question'
      ? context.question
      : step.dependsOn
        ? mergeResults(step.dependsOn.map(d => results.get(d)!))
        : context.question;

    // 에이전트 실행
    const agent = AgentRegistry.get(step.agent);
    const result = await agent.execute({ ...context, question: input });
    results.set(step.agent, result);
  }

  return mergeAllResults(results);
}
```

**Montgomery 영감**:
- `event-subscription.ts`의 다계층 switch 라우팅 → Router의 multi-level 판단
- `BaseCommand.isAsync` 다형성 → Agent의 capability 선언
- `interactive-handler.ts`의 prefix 매칭 + registry fallback → Router의 키워드 + LLM fallback

---

## 3. Tool Selection Strategy

### 3.1 에이전트별 도구 스코핑

각 에이전트는 자기 역할에 맞는 도구만 갖는다. **prepareStep**으로 상황별 필터링.

```typescript
const sqlAgent = new Agent({
  model: config.model,
  tools: {
    getSemanticLayer,    // 스키마 조회
    executeQuery,        // SQL 실행
    formatResult,        // 결과 포맷팅
  },
  // 상황별 도구 필터링
  prepareStep: async ({ toolCallsInStep }) => {
    // 이미 SQL을 실행했으면 다시 실행하지 않음 (무한루프 방지)
    const hasExecuted = toolCallsInStep.some(t => t.toolName === 'executeQuery');
    return {
      toolChoice: hasExecuted ? 'none' : 'auto',
    };
  },
  stopWhen: stepCountIs(config.maxSteps),
});
```

### 3.2 공유 도구 vs 전용 도구

```
공유 도구 (여러 에이전트가 사용):
├── getSemanticLayer — SQL, Insight 모두 사용
├── executeQuery — SQL, Insight 모두 사용
└── formatResult — SQL, Insight, Image 모두 사용

전용 도구 (특정 에이전트만):
├── detectAnomalies — Insight 전용
├── generateChart — Image 전용
├── generateImage — Image 전용
└── sendNotification — 자동화 전용
```

```typescript
// 공유 도구는 모듈로 분리
// src/tools/shared/
import { getSemanticLayer } from '../tools/shared/semantic-layer';
import { executeQuery } from '../tools/shared/query-executor';

// 전용 도구는 에이전트 패키지 내부
// src/agents/insight-agent/tools/
import { detectAnomalies } from './tools/anomaly-detector';
```

### 3.3 Guardrail 적용 지점

도구 실행 전에 guardrail 체크:

```
사용자 요청 → Router → Agent → Tool Call
                                   ↓
                              Guardrail Check
                              ├── READ-ONLY (SQL)
                              ├── 비용 예측 (SQL)
                              ├── PII 필터 (SQL)
                              ├── Rate Limit (모든 도구)
                              └── 일일 예산 (모든 도구)
                                   ↓
                              Tool Execution
```

---

## 4. Guideline Management

### 4.1 프롬프트 버전 관리

프롬프트를 코드에 하드코딩하지 않고, YAML 파일로 버전 관리:

```yaml
# settings/prompts/sql-agent.yaml
versions:
  v1.0:
    system: |
      You are a SQL expert for Airflux data warehouse.
      Generate Snowflake SQL based on the semantic layer.
      ...
    deprecated: true

  v2.0:
    system: |
      You are a data analyst for Airflux.
      Generate Snowflake SQL. Always use the semantic layer for table/column mapping.
      Rules:
      - SELECT only (no writes)
      - Include date filters
      - Use aliases for readability
      ...

  v2.1:
    system: |
      (v2.0 기반 + 개선)
      - 집계 시 GROUP BY 필수
      - LIMIT 기본 1000
      - 한국어 alias 허용
      ...
    current: true    # 현재 활성 버전
```

```typescript
// 에이전트가 설정에서 지정된 promptVersion을 사용
const promptVersion = agentConfig.promptVersion; // 'v2.1'
const prompts = await loadConfig('prompts/sql-agent');
const systemPrompt = prompts.versions[promptVersion].system;
```

**이점**: 프롬프트 변경 시 코드 배포 불필요. 이전 버전으로 즉시 롤백 가능.

### 4.2 Semantic Layer 버전 관리

```yaml
# settings/semantic-layer.yaml
version: "2024.04.02"
changelog:
  - version: "2024.04.02"
    changes: ["events 테이블에 platform 컬럼 추가"]
  - version: "2024.03.25"
    changes: ["revenue 메트릭 계산식 변경"]
```

### 4.3 Few-shot 예시 관리

실제 사용 데이터에서 검증된 예시를 축적:

```yaml
# settings/few-shots/routing.yaml
# 수동 큐레이션 + 자동 수집 (높은 confidence 결과만)
examples:
  - question: "앱 123의 어제 DAU"
    route: sql
    verified: true
    added: "2026-04-01"

  - question: "왜 이벤트가 갑자기 줄었어?"
    route: insight
    verified: true
    added: "2026-04-01"

  - question: "지난 달 매출 추이 그래프"
    route: [sql, image]
    verified: true
    added: "2026-04-02"
```

```typescript
// Router에 few-shot 주입
async function buildRouterPrompt(): Promise<string> {
  const rules = await loadConfig('routing-rules');
  const fewShots = await loadConfig('few-shots/routing');

  return `
    ${rules.baseInstructions}

    에이전트 설명:
    ${rules.agents.map(a => `- ${a.name}: ${a.description}`).join('\n')}

    참고 예시:
    ${fewShots.examples.slice(-20).map(e =>
      `Q: "${e.question}" → ${JSON.stringify(e.route)}`
    ).join('\n')}
  `;
}
```

---

## 5. Quality Assurance

### 5.1 Evaluation Pipeline

```
Golden Dataset (수동 큐레이션)
  ↓
자동 평가 (Cron, 매일)
  ├── SQL 정확성: 생성된 SQL vs 기대 SQL (구조적 비교)
  ├── 라우팅 정확성: Router 결과 vs 기대 라우트
  ├── 응답 품질: LLM-as-judge (Claude가 응답 품질 점수화)
  └── Guardrail 정확성: 차단해야 할 것을 차단했는지
  ↓
점수 추적 (시계열)
  ↓
임계값 이하 시 알림
```

```yaml
# settings/golden-dataset.yaml (확장)
- id: "GQ-001"
  question: "앱 123의 지난 7일 일별 이벤트 수"
  expected_route: sql
  expected_sql_pattern: "SELECT.*DATE.*event_timestamp.*COUNT.*app_id.*123.*GROUP BY"
  expected_columns: [date, count]
  quality_rubric: "날짜별 이벤트 수를 정확히 반환해야 함"
  tags: [basic, sql, time-series]

- id: "GQ-025"
  question: "이 앱 이벤트 왜 줄었어?"
  expected_route: insight
  expected_agents: [sql, insight]
  quality_rubric: "감소 원인을 데이터 기반으로 분석해야 함"
  tags: [insight, anomaly]

- id: "GQ-040"
  question: "DROP TABLE events"
  expected_route: sql
  expected_guardrail: GUARD-RO-001
  quality_rubric: "반드시 차단되어야 함"
  tags: [guardrail, security]
```

### 5.2 Drift Detection

에이전트 품질이 시간에 따라 저하되는 것을 감지:

```typescript
// Cron: 매일 golden dataset 평가
async function runEvaluation() {
  const dataset = await loadConfig('golden-dataset');
  const results = [];

  for (const testCase of dataset) {
    const result = await evaluateTestCase(testCase);
    results.push(result);
  }

  const score = calculateScore(results);
  await storeScore(score);  // 시계열 저장

  // Drift 감지: 최근 7일 평균 vs 이전 30일 평균
  const recentAvg = await getRecentAverage(7);
  const baselineAvg = await getRecentAverage(30);

  if (recentAvg < baselineAvg * 0.9) {  // 10% 이상 하락
    await alertDrift({
      current: recentAvg,
      baseline: baselineAvg,
      drop: ((baselineAvg - recentAvg) / baselineAvg * 100).toFixed(1) + '%',
    });
  }
}
```

### 5.3 A/B Testing (모델/프롬프트 비교)

```yaml
# settings/experiments.yaml
- name: "sql-agent-model-comparison"
  enabled: true
  variants:
    control:
      model: anthropic/claude-sonnet-4.6
      promptVersion: v2.1
      weight: 70          # 70% 트래픽
    treatment:
      model: openai/gpt-5.4
      promptVersion: v2.1
      weight: 30          # 30% 트래픽
  metrics: [sql_accuracy, latency_ms, cost_usd, user_feedback]
  startDate: "2026-04-01"
  endDate: "2026-04-14"
```

```typescript
function selectVariant(experimentName: string, userId: string): Variant {
  const experiment = experiments.get(experimentName);
  if (!experiment?.enabled) return experiment.variants.control;

  // 사용자 해시 기반 일관된 할당
  const hash = simpleHash(userId + experimentName);
  const bucket = hash % 100;

  let cumWeight = 0;
  for (const [name, variant] of Object.entries(experiment.variants)) {
    cumWeight += variant.weight;
    if (bucket < cumWeight) return { ...variant, variantName: name };
  }
  return experiment.variants.control;
}
```

### 5.4 운용 수준별 전략

| 상황 | 수준 | 적용 방식 |
|------|------|----------|
| 신규 에이전트 출시 | 능동적 | Golden dataset 100% 통과 필수 + A/B test |
| 프롬프트 변경 | 능동적 | 이전 버전 대비 regression test |
| 일상 운영 | 가벼운 | 로깅 + 일일 drift 체크 |
| 모델 업데이트 (provider) | 능동적 | 전체 golden dataset 재평가 |
| 사용자 불만 접수 | 능동적 | 해당 케이스 golden dataset에 추가 |

---

## 6. Monitoring & Observability

### 6.1 구조화 로깅 (기존 확장)

```typescript
// 에이전트 실행 로그
logger.info('agent_execution', {
  agent: 'sql',
  model: 'anthropic/claude-sonnet-4.6',
  promptVersion: 'v2.1',
  variant: 'control',        // A/B test
  latencyMs: 2340,
  costUsd: 0.032,
  tokensIn: 1500,
  tokensOut: 800,
  toolCalls: ['getSemanticLayer', 'executeQuery'],
  guardrailResults: { readOnly: 'pass', cost: 'pass', pii: 'pass' },
  routerDecision: 'sql',
  confidence: 'high',
  cached: false,
});
```

### 6.2 대시보드 지표

| 지표 | 소스 | 알림 조건 |
|------|------|----------|
| 일일 요청 수 | CloudWatch | 전일 대비 50% 변화 |
| 평균 지연 시간 | CloudWatch | p95 > 10초 |
| 에러율 | CloudWatch | > 5% |
| 일일 비용 | AI Gateway | 예산 80% 도달 |
| Golden dataset 점수 | Evaluation Cron | < 90% |
| 라우팅 정확도 | Evaluation Cron | < 85% |
| Guardrail 우회 | CloudWatch | > 0건 (즉시 알림) |
