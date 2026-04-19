# Orchestrator Execution Model

> **STATUS (2026-04-18): DEFERRED**
>
> 이 문서는 현재 코드에 없는 `Orchestrator` 클래스 설계안입니다. 현행 실행 경로는
> `packages/server/src/routes/query.ts`의 단일 에이전트 디스패처이며, 모든
> 프로덕션 유스케이스가 이것으로 충족됩니다. `Inter-agent message bus`
> (`docs/FROZEN.md`) 해제가 선행 조건입니다.
>
> **해제 조건**: 한 에이전트의 출력이 다른 에이전트로 조건부 라우팅되고
> retry/recovery 의미가 필요한 실제 사용자 스토리가 문서화될 때.
>
> **그 전까지**: 이 문서는 설계안이지 출시 코드가 아닙니다. 다른 문서에서
> `Orchestrator`를 실재하는 것처럼 참조하지 마세요.

---

> 에이전트 간 공유 컨텍스트, 실행 전략, 병렬/순차 결정, 타임아웃

## 1. WorkingMemory — 에이전트 간 공유 상태

Orchestrator가 여러 에이전트를 실행할 때, 이전 에이전트의 결과를 다음 에이전트가 참조해야 한다. StepResult 프로토콜(06-data-protocol-feedback.md)이 데이터 전달을 담당하지만, **실행 중 공유 상태**가 추가로 필요하다.

```typescript
/**
 * WorkingMemory — Orchestrator 실행 동안 유지되는 공유 상태
 * 요청 시작 시 생성, 요청 완료 시 폐기
 */
interface WorkingMemory {
  // 요청 컨텍스트 (불변)
  readonly traceId: string;
  readonly userId: string;
  readonly originalQuestion: string;
  readonly appContext: AppContext | null;
  readonly startedAt: number;

  // 에이전트 실행 결과 (순차 누적)
  stepResults: Map<string, StepResult>;

  // 공유 데이터 (에이전트가 자유롭게 읽기/쓰기)
  shared: Map<string, any>;

  // 실행 메타데이터
  totalCostUsd: number;
  totalTokens: { input: number; output: number };
  executedAgents: string[];
  warnings: string[];
}

// 사용 예시
// SQL Agent가 조회한 데이터를 shared에 저장
memory.shared.set('queryResult', { rows: [...], headers: [...] });
memory.shared.set('queryMetrics', ['dau', 'event_count']);

// Insight Agent가 shared에서 읽기
const data = memory.shared.get('queryResult');
const metrics = memory.shared.get('queryMetrics');

// Image Agent가 shared에서 데이터 + 인사이트 모두 참조
const queryResult = memory.shared.get('queryResult');
const anomalies = memory.shared.get('anomalies');
```

## 2. 실행 전략 (3가지)

### 2.1 Sequential (순차)

가장 일반적. 이전 결과가 다음 입력에 필요할 때.

```
SQL Agent → (결과) → Insight Agent → (결과) → Image Agent
```

```typescript
async function executeSequential(
  plan: OrchestrationStep[],
  memory: WorkingMemory,
  responseChannel: ResponseChannel,
): Promise<void> {
  for (const step of plan) {
    if (shouldSkip(step, memory)) continue;

    await responseChannel.sendProgress(`🔄 ${step.agent} 실행 중...`);
    const startTime = Date.now();

    try {
      const context = buildStepContext(step, memory);
      const result = await executeWithTimeout(step.agent, context, step.timeoutMs);

      memory.stepResults.set(step.agent, result);
      memory.executedAgents.push(step.agent);
      memory.totalCostUsd += result.metadata.costUsd;

      // 에이전트가 shared에 저장한 데이터도 유지됨
    } catch (error) {
      handleStepError(step, error, memory, responseChannel);
    }
  }
}
```

### 2.2 Parallel (병렬)

서로 독립적인 에이전트를 동시에 실행. 예: 여러 앱의 데이터를 동시 조회.

```
┌→ SQL Agent (앱 123) ──┐
│                        ├→ Merge → Insight Agent
└→ SQL Agent (앱 456) ──┘
```

```typescript
async function executeParallel(
  steps: OrchestrationStep[],
  memory: WorkingMemory,
  responseChannel: ResponseChannel,
): Promise<void> {
  await responseChannel.sendProgress(
    `🔄 ${steps.map(s => s.agent).join(', ')} 병렬 실행 중...`
  );

  const results = await Promise.allSettled(
    steps.map(async (step) => {
      const context = buildStepContext(step, memory);
      return {
        agent: step.agent,
        result: await executeWithTimeout(step.agent, context, step.timeoutMs),
      };
    })
  );

  // 성공한 결과만 memory에 저장
  for (const settled of results) {
    if (settled.status === 'fulfilled') {
      memory.stepResults.set(settled.value.agent, settled.value.result);
      memory.executedAgents.push(settled.value.agent);
    } else {
      memory.warnings.push(`${settled.reason?.agent || 'unknown'} 실패`);
    }
  }
}
```

### 2.3 Conditional (조건부)

이전 결과에 따라 실행 여부 결정.

```
SQL Agent → Insight Agent → (이상치 있으면) → Image Agent
                           → (이상치 없으면) → 건너뜀
```

```typescript
interface OrchestrationStep {
  agent: string;
  strategy: 'sequential' | 'parallel';
  dependsOn?: string[];
  condition?: (memory: WorkingMemory) => boolean;
  timeoutMs: number;
  optional: boolean;  // 실패해도 전체 실패 안 함
}

// 조건 예시
const imageStep: OrchestrationStep = {
  agent: 'image',
  strategy: 'sequential',
  dependsOn: ['insight'],
  condition: (memory) => {
    const insightResult = memory.stepResults.get('insight');
    const anomalies = insightResult?.data?.anomalies || [];
    return anomalies.length > 0;  // 이상치가 있을 때만 차트 생성
  },
  timeoutMs: 30000,
  optional: true,
};
```

## 3. 실행 계획 생성 (Router → Plan)

Router Agent가 의도를 분류하면, Orchestrator가 실행 계획을 생성:

```typescript
function buildExecutionPlan(
  routerDecision: RouterDecision,
  memory: WorkingMemory,
): OrchestrationStep[] {
  const agents = routerDecision.agents;

  // 단일 에이전트
  if (agents.length === 1) {
    return [{ agent: agents[0], strategy: 'sequential', timeoutMs: 60000, optional: false }];
  }

  // 알려진 파이프라인 패턴
  if (arraysEqual(agents, ['sql', 'insight'])) {
    return [
      { agent: 'sql', strategy: 'sequential', timeoutMs: 30000, optional: false },
      { agent: 'insight', strategy: 'sequential', dependsOn: ['sql'], timeoutMs: 60000, optional: false },
    ];
  }

  if (arraysEqual(agents, ['sql', 'insight', 'image'])) {
    return [
      { agent: 'sql', strategy: 'sequential', timeoutMs: 30000, optional: false },
      { agent: 'insight', strategy: 'sequential', dependsOn: ['sql'], timeoutMs: 60000, optional: false },
      { agent: 'image', strategy: 'sequential', dependsOn: ['insight'],
        condition: (m) => (m.stepResults.get('insight')?.data?.anomalies?.length || 0) > 0,
        timeoutMs: 30000, optional: true },
    ];
  }

  // 다중 앱 비교
  if (routerDecision.multiApp && routerDecision.appIds.length > 1) {
    const parallelQueries = routerDecision.appIds.map(appId => ({
      agent: 'sql',
      strategy: 'parallel' as const,
      timeoutMs: 30000,
      optional: false,
      // 각 병렬 실행에 다른 앱 컨텍스트 주입
      overrideContext: { appId },
    }));
    return [
      ...parallelQueries,
      { agent: 'insight', strategy: 'sequential', dependsOn: parallelQueries.map((_, i) => `sql_${i}`),
        timeoutMs: 60000, optional: false },
    ];
  }

  // 기본: 순차 실행
  return agents.map((agent, i) => ({
    agent,
    strategy: 'sequential' as const,
    dependsOn: i > 0 ? [agents[i - 1]] : undefined,
    timeoutMs: 60000,
    optional: i > 0,  // 첫 번째 에이전트만 필수
  }));
}
```

## 4. 타임아웃 관리

```typescript
async function executeWithTimeout<T>(
  agentName: string,
  context: AgentContext,
  timeoutMs: number,
): Promise<T> {
  const agent = await AgentRegistry.get(agentName);
  if (!agent) throw new AirfluxError('LLM-API-001', { agent: agentName });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await agent.execute(context, { signal: controller.signal });
    return result;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new AirfluxError('SQL-EXEC-001', {
        agent: agentName,
        timeout: timeoutMs,
        message: `${agentName} 에이전트가 ${timeoutMs / 1000}초 내에 응답하지 않았습니다`,
      });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// 전체 Orchestration 타임아웃 (개별 step 합산 + 여유)
const ORCHESTRATION_TIMEOUT_MS = 5 * 60 * 1000;  // 5분
```

## 5. 비용 누적 + 예산 체크

```typescript
async function checkBudgetMidExecution(memory: WorkingMemory): Promise<boolean> {
  const config = await getGlobalConfig();
  const dailySpent = await getDailySpent();

  // 일일 예산의 80% 도달 시 경고
  if (dailySpent + memory.totalCostUsd > config.dailyBudgetHardCap * 0.8) {
    memory.warnings.push('일일 예산 80% 도달 — 남은 에이전트 실행 제한될 수 있습니다');
  }

  // 100% 초과 시 중단
  if (dailySpent + memory.totalCostUsd > config.dailyBudgetHardCap) {
    throw new AirfluxError('AUTH-BUDGET-001');
  }

  // 단일 요청 비용 한도
  const agentConfig = await getAgentConfig(memory.executedAgents[memory.executedAgents.length - 1]);
  if (memory.totalCostUsd > agentConfig.costLimitPerRequest * memory.executedAgents.length) {
    memory.warnings.push('이 요청의 비용이 예상보다 높습니다');
  }

  return true;
}
```

## 6. Orchestrator 전체 흐름

```typescript
async function orchestrate(
  routerDecision: RouterDecision,
  context: AgentContext,
  responseChannel: ResponseChannel,
): Promise<AgentResult> {
  // 1. WorkingMemory 생성
  const memory: WorkingMemory = {
    traceId: context.traceId,
    userId: context.userId,
    originalQuestion: context.question,
    appContext: context.appContext,
    startedAt: Date.now(),
    stepResults: new Map(),
    shared: new Map(),
    totalCostUsd: 0,
    totalTokens: { input: 0, output: 0 },
    executedAgents: [],
    warnings: [],
  };

  // 2. 실행 계획 생성
  const plan = buildExecutionPlan(routerDecision, memory);

  logger.info('orchestration_started', {
    traceId: memory.traceId,
    plan: plan.map(s => ({ agent: s.agent, strategy: s.strategy, optional: s.optional })),
  });

  // 3. 계획 실행
  const overallTimeout = setTimeout(() => {
    throw new AirfluxError('SQL-EXEC-001', { message: 'Orchestration 전체 타임아웃' });
  }, ORCHESTRATION_TIMEOUT_MS);

  try {
    // 병렬 그룹과 순차 그룹을 분리하여 실행
    const groups = groupByStrategy(plan);
    for (const group of groups) {
      if (group.strategy === 'parallel') {
        await executeParallel(group.steps, memory, responseChannel);
      } else {
        await executeSequential(group.steps, memory, responseChannel);
      }

      // 매 그룹 후 예산 체크
      await checkBudgetMidExecution(memory);
    }
  } finally {
    clearTimeout(overallTimeout);
  }

  // 4. 결과 병합
  const merged = mergeStepResults(memory);

  // 5. 경고 추가
  if (memory.warnings.length > 0) {
    merged.pipelineWarning = memory.warnings.join('. ');
  }

  logger.info('orchestration_completed', {
    traceId: memory.traceId,
    agents: memory.executedAgents,
    totalCostUsd: memory.totalCostUsd,
    totalLatencyMs: Date.now() - memory.startedAt,
  });

  return merged;
}
```

## 7. 설계 결정 이유

| 결정 | 이유 |
|------|------|
| WorkingMemory (요청 스코프) | 에이전트 간 데이터 공유가 StepResult만으로 부족 — 중간 상태 필요 |
| shared Map (자유형) | 에이전트마다 다른 데이터를 저장 — 스키마 고정 불가 |
| 3가지 실행 전략 | 순차(의존성), 병렬(독립), 조건부(옵션) — 모든 케이스 커버 |
| 알려진 파이프라인 패턴 하드코딩 | LLM이 매번 계획을 생성하면 비용 + 불확실성. 자주 쓰는 패턴은 미리 정의 |
| 개별 + 전체 타임아웃 | 하나가 느려도 전체가 멈추지 않게 |
| 매 그룹 후 예산 체크 | 비용 폭주를 중간에 감지 |
