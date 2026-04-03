# Prompt Engineering & Context Window Management

> 에이전트별 프롬프트 구조, context window 최적화, 캐싱 전략

## 1. 프롬프트 아키텍처

### 1.1 3-Layer 프롬프트 구조

모든 에이전트는 동일한 3-layer 구조를 따른다:

```
┌─────────────────────────────────────────┐
│  Layer 1: Static System Prompt          │  ← 에이전트 정체성, 규칙
│  (YAML 버전 관리, cache_control 적용)    │     5분 캐시, 90% 토큰 절약
├─────────────────────────────────────────┤
│  Layer 2: Dynamic Context               │  ← 요청마다 변경
│  - Semantic Layer (관련 도메인만 선별)    │     Metric, 테이블, 컬럼 정보
│  - Domain Glossary (상위 10개 용어)      │     한국어↔영어 용어 매핑
│  - Few-shot 예시 (상위 5개)             │     검증된 Q→A 쌍
│  - 세션 히스토리 (최근 3개 질문/답변)     │     대화 연속성
├─────────────────────────────────────────┤
│  Layer 3: User Message                   │  ← 사용자 질문
│  - 전처리된 질문 (prefix 제거, 멘션 제거) │
│  - 이전 StepResult (Orchestrator 경유)   │
│  - 이미지 (있는 경우)                    │
└─────────────────────────────────────────┘
```

### 1.2 Context Window 예산 관리

Claude Sonnet의 context window (200K tokens)를 효율적으로 사용:

```typescript
const CONTEXT_BUDGET = {
  systemPrompt: 4000,       // Layer 1: 고정 프롬프트
  semanticLayer: 3000,      // Layer 2: 관련 도메인만 선별
  glossary: 1000,           // Layer 2: 상위 10개
  fewShots: 2000,           // Layer 2: 5개 예시
  sessionHistory: 2000,     // Layer 2: 최근 3 턴
  previousStepResults: 3000, // Layer 3: 이전 에이전트 결과
  userMessage: 1000,        // Layer 3: 사용자 질문
  // 총합: ~16,000 tokens (context의 8%)
  // 나머지: LLM 응답 + tool 결과용
};

function buildPrompt(
  agent: AgentConfig,
  context: AgentContext,
  previousResults?: Map<string, StepResult>,
): PromptComponents {
  // 1. 시스템 프롬프트 (YAML에서 로드)
  const systemPrompt = loadPromptVersion(agent.name, agent.promptVersion);

  // 2. Semantic Layer — 관련 도메인만 선별
  const relevantMetrics = selectRelevantMetrics(context.question, CONTEXT_BUDGET.semanticLayer);

  // 3. Glossary — 질문과 관련된 용어 우선
  const relevantTerms = selectRelevantTerms(context.question, 10);

  // 4. Few-shot — 유사한 질문 우선
  const fewShots = selectSimilarFewShots(context.question, 5);

  // 5. 세션 히스토리 — 최근 3턴만
  const history = getRecentHistory(context.sessionId, 3);

  // 6. 이전 StepResult — 요약 우선, 데이터는 축약
  const prevContext = previousResults
    ? summarizePreviousResults(previousResults, CONTEXT_BUDGET.previousStepResults)
    : '';

  return { systemPrompt, relevantMetrics, relevantTerms, fewShots, history, prevContext };
}
```

### 1.3 관련 컨텍스트 선별 (Relevance Filtering)

전체 Semantic Layer를 주입하면 context가 낭비된다. 질문과 관련된 부분만 선별:

```typescript
/**
 * 질문에서 키워드를 추출하여 관련 metric만 선별.
 * Montgomery 패턴: SQL Agent가 전체 metric을 주입했으나,
 * Airflux는 규모가 크므로 선별 필요.
 */
function selectRelevantMetrics(question: string, tokenBudget: number): string {
  const allMetrics = loadSemanticLayer().metrics;
  const scored: Array<{ key: string; metric: any; score: number }> = [];

  for (const [key, metric] of Object.entries(allMetrics)) {
    let score = 0;

    // 이름/별칭 매칭
    const names = [metric.name, key, ...(metric.aliases || [])];
    for (const name of names) {
      if (question.toLowerCase().includes(name.toLowerCase())) {
        score += 10;
      }
    }

    // 테이블명 매칭
    if (question.toLowerCase().includes(metric.table.split('.').pop()!.toLowerCase())) {
      score += 5;
    }

    // 차원 매칭
    for (const dim of metric.dimensions || []) {
      if (question.toLowerCase().includes(dim.toLowerCase())) {
        score += 3;
      }
    }

    if (score > 0) scored.push({ key, metric, score });
  }

  // 점수 높은 순 + 토큰 예산 내에서 선택
  scored.sort((a, b) => b.score - a.score);

  let result = '';
  let tokens = 0;
  for (const item of scored) {
    const entry = formatMetricEntry(item.key, item.metric);
    const entryTokens = estimateTokens(entry);
    if (tokens + entryTokens > tokenBudget) break;
    result += entry + '\n';
    tokens += entryTokens;
  }

  // 매칭 없으면 상위 5개 기본 metric 반환
  if (result === '') {
    return formatTopMetrics(allMetrics, 5);
  }

  return result;
}
```

---

## 2. 에이전트별 프롬프트 전략

### 2.1 Router Agent — 빠르고 정확한 의도 분류

```yaml
# settings/prompts/router-agent.yaml
versions:
  v1.0:
    system: |
      당신은 Airflux 에이전트 시스템의 라우터입니다.
      사용자 질문을 분석하여 적절한 에이전트 조합을 선택하세요.

      에이전트 목록:
      {agent_descriptions}

      라우팅 규칙:
      {routing_rules}

      참고 예시:
      {few_shot_examples}

      출력 형식: generate_route 도구를 사용하여 JSON으로 반환.
    current: true
```

- 모델: `claude-haiku-4.5` (빠르고 저렴 — 라우팅은 단순 분류)
- maxSteps: 1 (한 번에 결정)
- temperature: 0 (결정적)
- context 최소화: agent descriptions + routing rules + few-shots만

### 2.2 SQL Agent — 정밀한 SQL 생성

```yaml
# settings/prompts/sql-agent.yaml
versions:
  v2.1:
    system: |
      당신은 Airflux 데이터 웨어하우스의 SQL 전문가입니다.
      Snowflake SQL을 생성하여 사용자 질문에 답합니다.

      ## 테이블 및 메트릭
      {semantic_layer}

      ## 도메인 용어
      {domain_glossary}

      ## 규칙
      1. SELECT 쿼리만 생성 (INSERT/UPDATE/DELETE/DROP 금지)
      2. 날짜 필터 필수 포함 (기본 7일)
      3. 집계 시 GROUP BY 필수
      4. LIMIT 기본 1000 (명시 없으면)
      5. 별칭은 한국어 허용 (AS "일별 이벤트 수")
      6. Pre-aggregated 컬럼이 있으면 직접 사용 (재집계 불필요)

      ## 이전 대화 컨텍스트
      {session_history}
    current: true
```

- 모델: `claude-sonnet-4.6` (정밀한 SQL 생성 필요)
- cache_control: ephemeral (5분, 시스템 프롬프트 캐싱)
- Structured Output: tool_use로 `{ sql, tables_used, confidence }` 추출
- 자가 수정: tool 에러 시 최대 5회 재시도

### 2.3 Insight Agent — 분석적 사고

```yaml
# settings/prompts/insight-agent.yaml
versions:
  v1.0:
    system: |
      당신은 Airflux 데이터 분석가입니다.
      데이터를 분석하여 실행 가능한 인사이트를 도출합니다.

      ## 분석 프레임워크
      1. 추이 분석: 증가/감소 패턴, 변곡점 식별
      2. 이상 탐지: 통계적 이상치 (Z-score), 갑작스러운 변화
      3. 비교 분석: 기간 대비, 앱 간, 이벤트 간
      4. 원인 분석: 변화의 가능한 원인 추론

      ## 출력 가이드
      - 핵심부터 말하기 (결론 → 근거 → 상세)
      - 숫자 근거 필수 (변화율, 절대값)
      - 실행 가능한 권장 액션 포함
      - 한국어, 간결하게

      ## 이전 데이터
      {previous_step_results}
    current: true
```

- 모델: `claude-sonnet-4.6`
- temperature: 0.3 (약간의 창의성 허용)
- 이전 SQL Agent 결과를 `{previous_step_results}`에 주입

### 2.4 Image Agent — 시각화 도구 선택

```yaml
# settings/prompts/image-agent.yaml
versions:
  v1.0:
    system: |
      당신은 데이터 시각화 전문가입니다.
      데이터를 적절한 차트/다이어그램으로 시각화합니다.

      ## 도구 선택 기준
      - 시계열 → line chart (QuickChart)
      - 비교 → bar chart (QuickChart)
      - 비율 → pie/doughnut chart (QuickChart)
      - 복잡한 관계 → Mermaid diagram
      - 커스텀/인포그래픽 → Gemini Image

      ## 스타일 가이드
      - 깔끔하고 전문적인 스타일
      - 한국어 레이블
      - 색상: AB180 브랜드 (#0066FF 계열)
      - 데이터 레이블 포함

      ## 이전 데이터
      {previous_step_results}
    current: true
```

---

## 3. 프롬프트 캐싱 전략

### 3.1 Claude API cache_control

Montgomery SQL Agent가 사용하는 패턴을 모든 에이전트에 확장:

```typescript
// AI SDK 6에서의 캐싱 적용
const result = await streamText({
  model: agentConfig.model,
  system: systemPrompt,
  // AI Gateway가 cache_control을 자동 전달
  // Claude: ephemeral (5분), OpenAI: server-side cache (자동)
  messages: [...],
  providerOptions: {
    anthropic: {
      cacheControl: true,  // system prompt 자동 캐싱
    },
  },
});
```

### 3.2 Application-Level 캐싱

```
                         ┌─────────────────┐
                         │ Config Cache     │
                         │ (In-memory, 5m)  │
                         │ - YAML configs   │
                         │ - Prompt versions│
                         │ - Semantic Layer │
                         └────────┬────────┘
                                  │
    ┌─────────────────────────────┼─────────────────────────────┐
    │                             │                             │
    ▼                             ▼                             ▼
┌──────────┐              ┌──────────┐              ┌──────────┐
│ LLM Cache│              │Query Cache│              │Few-shot  │
│(ephemeral│              │(Redis,TTL)│              │Cache     │
│ 5min)    │              │           │              │(Redis)   │
│          │              │ SQL hash→ │              │          │
│ System   │              │ result    │              │ Similar  │
│ prompt   │              │           │              │ query→   │
│ reuse    │              │ 1min~24h  │              │ examples │
└──────────┘              └──────────┘              └──────────┘
```

### 3.3 캐시 동기화

프롬프트 버전 변경 시 관련 캐시 무효화:

```typescript
// 프롬프트 버전 변경 시
async function onPromptVersionChange(agentName: string, newVersion: string): Promise<void> {
  // 1. Config cache 무효화
  configCache.delete(`prompts/${agentName}`);

  // 2. LLM cache는 자동 만료 (5분)
  // → 새 system prompt가 다른 캐시 키를 생성

  // 3. Query cache는 유지 (SQL 결과는 프롬프트와 무관)

  // 4. Golden dataset 재평가 트리거
  await triggerEvaluation(agentName, `prompt_change:${newVersion}`);

  logger.info('prompt_version_changed', { agent: agentName, version: newVersion });
}
```

---

## 4. 세션 컨텍스트 관리

### 4.1 대화 히스토리 주입

후속 질문에서 이전 대화를 참조:

```typescript
function buildSessionContext(sessionId: string, maxTurns: number = 3): string {
  const session = getSession(sessionId);
  if (!session || session.questions.length === 0) return '';

  // 최근 N턴만 (context 예산 관리)
  const recentTurns = session.questions.slice(-maxTurns);

  return `이전 대화:
${recentTurns.map((q, i) => `Q${i + 1}: ${q}`).join('\n')}
${session.lastSQL ? `마지막 SQL: ${session.lastSQL}` : ''}
${session.lastMetrics?.length ? `관련 메트릭: ${session.lastMetrics.join(', ')}` : ''}`;
}
```

### 4.2 Follow-up 질문 처리

"더 자세히", "기간을 늘려서", "차트로 보여줘" 같은 후속 질문:

```typescript
// Router Agent가 후속 질문을 감지
// 세션 히스토리가 있고, 질문이 짧으면 → 후속 질문 가능성 높음
function isFollowUp(question: string, session: SessionData): boolean {
  if (!session || session.questions.length === 0) return false;
  // 짧은 질문 (10단어 미만) + 세션 존재 = 후속 가능성
  return question.split(/\s+/).length < 10;
}

// 후속 질문이면 이전 컨텍스트를 풍부하게 주입
function enrichFollowUpContext(question: string, session: SessionData): string {
  return `이전 질문: ${session.questions[session.questions.length - 1]}
이전 SQL: ${session.lastSQL || '없음'}
후속 질문: ${question}

이전 분석 결과를 기반으로 후속 질문에 답하세요.`;
}
```

---

## 5. 설계 결정 이유

| 결정 | 이유 |
|------|------|
| 3-Layer 프롬프트 | System(캐싱 가능) / Dynamic(요청별) / User(입력) 분리로 캐시 효율 극대화 |
| Relevance Filtering | 전체 Semantic Layer 주입 → context 낭비. 키워드 기반 선별로 관련 metric만 |
| YAML 프롬프트 버전관리 | 코드 배포 없이 프롬프트 변경 + 즉시 롤백 가능 |
| Router에 Haiku | 의도 분류는 단순 작업 — 빠르고 저렴한 모델이 적합 |
| cache_control ephemeral | Montgomery에서 검증된 90% 토큰 절약 패턴 |
| 최근 3턴 히스토리 | Context 예산 vs 대화 연속성의 균형점 |
| Few-shot 5개 제한 | 너무 많으면 context 낭비 + 관련 없는 예시가 방해 |
