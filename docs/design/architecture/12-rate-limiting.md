# Rate Limiting & Concurrency

> 사용자별/에이전트별 요청 제한, 동시성 관리, 큐잉

## 1. Rate Limit 계층

```
Layer 1: 엔드포인트 레벨 (요청 수)
  ├── Slack: Slack 자체 rate limit 존중 (1msg/sec/channel)
  ├── API: 분당 60 요청/사용자
  └── Webhook: 분당 30 요청/소스

Layer 2: 에이전트 레벨 (동시 실행)
  ├── SQL Agent: 동시 10건
  ├── Insight Agent: 동시 5건
  ├── Image Agent: 동시 3건
  └── 전체: 동시 15건

Layer 3: 비용 레벨 (일일 예산)
  ├── 사용자별: roles에 따른 maxDailyQueries
  ├── 에이전트별: agents.yaml의 dailyBudget
  └── 전체: $200/일 hard cap
```

## 2. 구현: Redis 기반 Sliding Window

```typescript
import { Redis } from '@upstash/redis';

const redis = new Redis({ url: process.env.REDIS_URL });

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number;      // 초
  retryAfter?: number;  // 초 (blocked일 때)
}

async function checkRateLimit(
  key: string,         // e.g. "user:U123:api" or "agent:sql:concurrent"
  limit: number,       // 최대 허용
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - (windowSeconds * 1000);

  // Sliding window: sorted set에 타임스탬프 기록
  const pipe = redis.pipeline();
  pipe.zremrangebyscore(key, 0, windowStart);  // 만료된 항목 제거
  pipe.zadd(key, { score: now, member: `${now}` });
  pipe.zcard(key);                              // 현재 윈도우 내 요청 수
  pipe.expire(key, windowSeconds);
  const [, , count] = await pipe.exec();

  const current = count as number;
  if (current > limit) {
    // 윈도우 내 가장 오래된 요청의 만료 시간 계산
    const oldest = await redis.zrange(key, 0, 0, { withScores: true });
    const retryAfter = oldest.length > 0
      ? Math.ceil((oldest[0].score + windowSeconds * 1000 - now) / 1000)
      : windowSeconds;

    return { allowed: false, remaining: 0, resetIn: retryAfter, retryAfter };
  }

  return { allowed: true, remaining: limit - current, resetIn: windowSeconds };
}
```

## 3. 동시성 제어 (Semaphore)

```typescript
// Redis 기반 분산 세마포어
async function acquireConcurrencySlot(
  agent: string,
  maxConcurrent: number,
  timeoutMs: number = 900_000,  // 15분 (Worker Lambda 최대)
): Promise<{ acquired: boolean; release: () => Promise<void> }> {
  const key = `concurrency:${agent}`;
  const slotId = crypto.randomUUID();
  const expireAt = Date.now() + timeoutMs;

  // 만료된 슬롯 제거 + 현재 수 확인
  await redis.zremrangebyscore(key, 0, Date.now());
  const current = await redis.zcard(key);

  if (current >= maxConcurrent) {
    return { acquired: false, release: async () => {} };
  }

  // 슬롯 획득
  await redis.zadd(key, { score: expireAt, member: slotId });

  return {
    acquired: true,
    release: async () => {
      await redis.zrem(key, slotId);
    },
  };
}

// Worker에서 사용
async function executeWithConcurrency(agent: string, fn: () => Promise<any>): Promise<any> {
  const config = await loadConfig('agents');
  const maxConcurrent = CONCURRENCY_LIMITS[agent] || 10;

  const slot = await acquireConcurrencySlot(agent, maxConcurrent);
  if (!slot.acquired) {
    throw new AirfluxError('LLM-API-002', { reason: '동시 요청 한도 초과' });
  }

  try {
    return await fn();
  } finally {
    await slot.release();
  }
}

const CONCURRENCY_LIMITS: Record<string, number> = {
  'sql': 10,
  'insight': 5,
  'image': 3,
  'router': 20,
};
```

## 4. 큐잉 (Rate Limit 초과 시)

즉시 거부 대신 큐에 넣고 순서대로 처리하는 옵션:

```typescript
// Slack 요청: 즉시 "대기 중" 응답 → Worker에서 큐 순서대로 처리
async function handleRateLimited(context: AgentContext): Promise<void> {
  const queuePosition = await redis.rpush('agent-queue', JSON.stringify({
    context: serializeContext(context),
    enqueuedAt: Date.now(),
  }));

  await context.responseChannel.sendProgress(
    `⏳ 요청이 많아 대기 중입니다 (${queuePosition}번째). 잠시 후 처리됩니다.`
  );
}

// Worker가 주기적으로 큐 확인 (Cron 또는 SQS)
async function processQueue(): Promise<void> {
  const item = await redis.lpop('agent-queue');
  if (!item) return;

  const { context } = JSON.parse(item);
  const slot = await acquireConcurrencySlot(context.agent, CONCURRENCY_LIMITS[context.agent]);
  if (slot.acquired) {
    try {
      await executeAgent(deserializeContext(context));
    } finally {
      await slot.release();
    }
  } else {
    // 다시 큐에 넣기 (앞쪽에)
    await redis.lpush('agent-queue', item);
  }
}
```

## 5. API 응답 헤더

REST API 엔드포인트에 표준 rate limit 헤더 포함:

```typescript
function addRateLimitHeaders(res: Response, result: RateLimitResult): void {
  res.headers.set('X-RateLimit-Limit', String(result.limit));
  res.headers.set('X-RateLimit-Remaining', String(result.remaining));
  res.headers.set('X-RateLimit-Reset', String(result.resetIn));
  if (!result.allowed) {
    res.headers.set('Retry-After', String(result.retryAfter));
  }
}
```

## 6. Rate Limit 설정

```yaml
# settings/rate-limits.yaml
endpoints:
  slack:
    requestsPerMinute: 30    # Slack 자체 제한이 더 엄격하므로 여유
    concurrentPerUser: 3
  api:
    requestsPerMinute: 60
    concurrentPerUser: 5
  webhook:
    requestsPerMinute: 30
    concurrentPerSource: 3

agents:
  router: { maxConcurrent: 20 }
  sql: { maxConcurrent: 10 }
  insight: { maxConcurrent: 5 }
  image: { maxConcurrent: 3 }

global:
  maxConcurrentTotal: 15
  dailyBudgetHardCap: 200    # USD
  queueMaxSize: 50           # 큐 최대 크기
  queueItemTimeout: 300      # 큐 아이템 5분 후 만료
```

## 7. 설계 결정 이유

| 결정 | 이유 |
|------|------|
| Redis Sliding Window | 정확한 rate limit + Lambda stateless 환경에 적합 |
| 분산 세마포어 | 여러 Worker Lambda가 동시에 실행되므로 분산 제어 필수 |
| 큐잉 옵션 | 즉시 거부보다 대기가 사용자 경험에 유리 |
| 에이전트별 동시성 | Image(Gemini)는 비용이 높으므로 낮은 동시성 |
| 15분 슬롯 만료 | Worker Lambda 최대 실행 시간 = 15분 |
