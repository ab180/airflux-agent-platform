# Cost Optimization & Model Selection Guide

> AI Gateway 비용 관리, 에이전트별 모델 선택, 캐싱으로 비용 절감

## 1. 비용 구조

```
요청 1건 비용 = LLM 토큰 비용 + Snowflake 쿼리 비용 + 인프라 비용
               ≈ $0.01-0.20     + $0.001-0.01      + ~무시 가능
```

**LLM이 지배적 비용**. 모든 최적화는 LLM 호출 횟수와 토큰 수를 줄이는 방향.

## 2. 에이전트별 모델 선택 전략

| 에이전트 | 기본 모델 | 이유 | 대안 |
|---------|----------|------|------|
| Router | `claude-haiku-4.5` | 분류만 하면 됨. 빠르고 저렴 | `gpt-5.4-mini` |
| SQL Agent | `claude-sonnet-4.6` | SQL 생성 정밀도 필수 | `gpt-5.4` (fallback) |
| Insight Agent | `claude-sonnet-4.6` | 분석적 추론 필요 | `gpt-5.4` |
| Image Agent | `claude-sonnet-4.6` + Gemini | 도구 선택 + 이미지 생성 | — |
| LLM-as-Judge | `claude-haiku-4.5` | 매일 실행, 비용 민감 | — |
| 후속질문 생성 | 코드 로직 | LLM 불필요. 규칙 기반 | — |

### 모델 선택 원칙

```
1. 가능한 가장 작은 모델을 기본으로
2. 정밀도가 필요한 작업만 큰 모델
3. 분류/판단은 Haiku, 생성/추론은 Sonnet
4. 후속질문/포맷팅 등 단순 작업은 코드 로직으로
5. A/B 테스트로 모델 성능 검증 후 전환
```

## 3. 비용 절감 전략 (8가지)

### 3.1 Prompt Caching (90% 절감)

Montgomery SQL Agent에서 검증된 패턴:

```typescript
// cache_control: ephemeral → 5분간 system prompt 캐싱
// 같은 system prompt로 여러 요청 시 input 토큰 90% 절감
system: [{
  type: 'text',
  text: systemPrompt,  // 4000 토큰 → 캐시 히트 시 400 토큰 비용
  cache_control: { type: 'ephemeral' },
}],
```

**효과**: 시스템 프롬프트가 4K 토큰이면, 5분 내 후속 요청은 400 토큰만 과금.

### 3.2 Router에 Haiku 사용 (80% 절감)

```
Router 호출 비용:
  Sonnet: ~$0.003/요청 (input 1K + output 0.2K)
  Haiku:  ~$0.0003/요청 (10배 저렴)

  일 200요청 기준: Sonnet $0.60/일 → Haiku $0.06/일
  연간 절감: ~$200
```

### 3.3 Query 결과 캐싱 (Redis)

같은 질문의 반복 요청을 캐싱:

```
"앱 123의 어제 DAU" → SQL hash → Redis 조회
  HIT (5분 이내 동일 질문) → LLM 호출 0건, 비용 $0
  MISS → LLM 호출 2건 (SQL 생성 + 해석), 비용 ~$0.02
```

**효과**: 반복 질문 30% 가정 시, 월 LLM 비용 30% 절감.

### 3.4 Relevance Filtering (Context 축소)

전체 Semantic Layer 대신 관련 metric만 주입:

```
전체 주입: 8K 토큰 (모든 metric + glossary)
선별 주입: 2K 토큰 (관련 3-5개 metric만)

절감: 요청당 6K input 토큰 × $0.003/1K = $0.018/요청
일 200요청: $3.60/일 절감
```

### 3.5 단일 LLM 호출로 SQL + 해석 통합

현재 2회 호출 (SQL 생성 + 결과 해석)을 상황에 따라 1회로:

```typescript
// 단순 조회 (confidence: high) → SQL 생성만, 해석은 코드로
if (sqlResult.confidence === 'high' && sqlResult.rows.length <= 5) {
  // LLM 해석 skip → 테이블 포맷만 반환
  return formatSimpleResult(sqlResult);
}

// 복잡한 결과 → LLM 해석 필요
return await interpretWithLLM(sqlResult);
```

**효과**: 단순 조회 60% 가정 시, 해석 LLM 호출 60% 절감.

### 3.6 일일 예산 제한

```yaml
# agents.yaml
- name: sql
  dailyBudget: 50.0  # USD

# 구현
async function checkBudget(agent: string, estimatedCost: number): Promise<boolean> {
  const spent = await getDailySpent(agent);
  if (spent + estimatedCost > config.dailyBudget) {
    throw new AirfluxError('AUTH-BUDGET-001', { spent, budget: config.dailyBudget });
  }
  return true;
}
```

### 3.7 Streaming으로 취소 가능

사용자가 잘못된 질문을 한 것을 깨달으면 중단:

```typescript
// Slack: 사용자가 스레드에 "취소" 입력 시
// API: SSE 연결 종료 시
// → Agent 실행 중단, 토큰 절약
```

### 3.8 Golden Dataset 평가 비용 관리

```
평가 1회 비용:
  60 test cases × (SQL Agent + LLM-as-Judge)
  = 60 × ($0.02 + $0.0003) ≈ $1.22/회

  매일 실행: $1.22 × 30 = $36.60/월
  → Haiku judge 사용으로 $0.0003 유지

  배포 시 subset만: 영향 받는 카테고리만 실행 → 평균 20 cases ≈ $0.41/회
```

## 4. 비용 추적 & 대시보드

### 4.1 요청별 비용 기록

```typescript
// 모든 LLM 호출에 비용 메타데이터 추가
logger.info('agent_execution', {
  agent: 'sql',
  model: 'anthropic/claude-sonnet-4.6',
  tokensIn: 2500,
  tokensOut: 800,
  costUsd: 0.012,      // AI Gateway 자동 추적
  cached: true,         // prompt cache 히트 여부
  variant: 'control',   // A/B test variant
});
```

### 4.2 비용 집계 쿼리 (CloudWatch Logs Insights)

```sql
-- 일별 에이전트별 비용
fields @timestamp, metadata.agent, metadata.costUsd
| filter event = 'agent_execution'
| stats sum(metadata.costUsd) as dailyCost by metadata.agent, datefloor(@timestamp, 1d) as day
| sort day desc

-- 모델별 비용 효율
fields metadata.model, metadata.costUsd, metadata.latencyMs
| filter event = 'agent_execution'
| stats avg(metadata.costUsd) as avgCost,
        avg(metadata.latencyMs) as avgLatency,
        count(*) as requests
  by metadata.model

-- 캐시 히트율
fields metadata.cached
| filter event = 'agent_execution'
| stats count(*) as total,
        sum(case metadata.cached when true then 1 else 0 end) as hits
| display hits * 100.0 / total as cacheHitRate
```

### 4.3 예산 알림

| 조건 | 알림 |
|------|------|
| 일일 비용 > 예산 50% | #airflux-costs (info) |
| 일일 비용 > 예산 80% | #airflux-costs (warning) |
| 일일 비용 > 예산 100% | #airflux-costs + @oncall (critical, 신규 요청 차단) |
| 단일 요청 > $1.00 | #airflux-costs (warning, 비정상 요청) |

## 5. 월별 예상 비용

### 일 200요청 기준 (초기)

| 항목 | 단가 | 월 비용 |
|------|------|--------|
| Router (Haiku) | $0.0003/req | $1.80 |
| SQL Agent (Sonnet, cached) | $0.008/req | $48.00 |
| Insight Agent (30% 사용) | $0.015/req | $27.00 |
| Image Agent (20% 사용) | $0.010/req | $12.00 |
| LLM-as-Judge (일일 평가) | $1.22/day | $36.60 |
| Snowflake | $0.003/req | $18.00 |
| Lambda (AWS) | — | ~$5.00 |
| Redis (Upstash) | — | ~$10.00 |
| **합계** | | **~$158/월** |

### 비용 절감 후 예상

| 최적화 | 절감율 | 절감액 |
|--------|--------|--------|
| Prompt Caching | 40% on SQL Agent | -$19 |
| Query 캐싱 (30% hit) | 30% on SQL+Insight | -$22 |
| 단순 조회 해석 skip | 20% on SQL Agent | -$10 |
| Relevance Filtering | 15% on 모든 Agent | -$13 |
| **최적화 후** | | **~$94/월** |

## 6. 설계 결정 이유

| 결정 | 이유 |
|------|------|
| Router에 Haiku | 의도 분류에 Sonnet은 과잉 — 10배 비용 차이 |
| Prompt Caching 최우선 | 90% 절감은 다른 어떤 최적화보다 효과적 |
| 해석 LLM 조건부 skip | 단순 테이블 결과는 LLM 해석 불필요 |
| 일일 예산 hard limit | 비정상 사용 시 비용 폭주 방지 |
| 평가에 Haiku | 매일 실행하는 작업이므로 비용 민감 |
