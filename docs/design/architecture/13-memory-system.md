# Agent Memory System

> 단기 기억 (세션), 중기 기억 (사용자 프로필), 장기 기억 (조직 지식)

## 1. 3-Tier 메모리 아키텍처

```
┌───────────────────────────────────────────┐
│  Tier 1: Working Memory (단기, 세션)       │
│  TTL: 30분, 저장: Redis                    │
│  - 현재 대화 히스토리 (최근 3턴)            │
│  - 현재 앱 컨텍스트                        │
│  - 마지막 SQL, 결과 요약                   │
├───────────────────────────────────────────┤
│  Tier 2: User Memory (중기, 사용자)        │
│  TTL: 30일, 저장: Redis (hash)             │
│  - 자주 조회하는 앱 목록                    │
│  - 선호 포맷 (테이블 vs 차트)              │
│  - 사용 패턴 (주로 쓰는 시간대, 에이전트)   │
│  - 최근 쿼리 이력 (20개)                   │
├───────────────────────────────────────────┤
│  Tier 3: Organization Memory (장기, 조직)  │
│  TTL: 영구, 저장: YAML + Redis             │
│  - Semantic Layer (테이블/메트릭 정의)      │
│  - Domain Glossary (용어 사전)             │
│  - Few-shot 예시 (검증된 Q→A 쌍)          │
│  - Golden Dataset (평가 기준)              │
│  - 앱별 도메인 노트                        │
└───────────────────────────────────────────┘
```

## 2. Tier 1: Working Memory (세션)

기존 `session-state.ts` 확장 → Redis:

```typescript
interface WorkingMemory {
  // 기존 SessionData 필드
  userId: string;
  channelId: string;
  threadTs: string;
  questions: string[];
  lastSQL?: string;
  lastMetrics?: string[];
  currentAppId?: number;
  mentionedApps: number[];
  createdAt: number;
  lastActiveAt: number;

  // 확장: 대화 컨텍스트
  conversationTurns: ConversationTurn[];  // 최근 3턴
  lastResult?: StepResult;                // 후속 질문용
  pendingClarification?: string;          // 모호성 해결 대기 중
}

interface ConversationTurn {
  question: string;
  route: string[];
  summary: string;        // 응답 요약
  sql?: string;
  timestamp: number;
}

// Redis 키: session:{threadTs}
// TTL: 30분 (lastActiveAt 기준 갱신)
```

## 3. Tier 2: User Memory (사용자 프로필)

사용자별 장기 선호도와 패턴:

```typescript
interface UserMemory {
  userId: string;
  firstSeen: number;
  totalQueries: number;

  // 선호도 (자동 학습)
  frequentApps: Array<{ appId: number; count: number }>;  // 상위 5개
  preferredFormat: 'table' | 'chart' | 'summary';          // 가장 많이 사용
  preferredTimeRange: string;                               // 기본 시간 범위
  activeHours: number[];                                    // 활동 시간대

  // 최근 이력
  recentQueries: Array<{
    question: string;
    route: string;
    appId?: number;
    timestamp: number;
  }>;  // 최근 20개

  // 피드백 집계
  feedbackPositive: number;
  feedbackNegative: number;
}

// Redis 키: user:{userId}
// TTL: 30일 (활동 시 갱신)

async function updateUserMemory(userId: string, query: QueryLog): Promise<void> {
  const memory = await getUserMemory(userId);

  memory.totalQueries++;
  memory.recentQueries.unshift({
    question: query.question,
    route: query.route,
    appId: query.appId,
    timestamp: Date.now(),
  });
  memory.recentQueries = memory.recentQueries.slice(0, 20);

  // 자주 조회하는 앱 업데이트
  if (query.appId) {
    const existing = memory.frequentApps.find(a => a.appId === query.appId);
    if (existing) existing.count++;
    else memory.frequentApps.push({ appId: query.appId, count: 1 });
    memory.frequentApps.sort((a, b) => b.count - a.count);
    memory.frequentApps = memory.frequentApps.slice(0, 5);
  }

  await saveUserMemory(userId, memory);
}
```

### 사용자 메모리 활용

```typescript
// 앱 미지정 시: frequentApps에서 제안
async function suggestApps(userId: string): Promise<string> {
  const memory = await getUserMemory(userId);
  if (memory.frequentApps.length === 0) return '앱 ID 또는 이름을 알려주세요.';

  const apps = await Promise.all(
    memory.frequentApps.slice(0, 3).map(async a => {
      const app = await getAppById(a.appId);
      return `• ${app.name} (ID: ${a.appId})`;
    })
  );
  return `자주 조회하시는 앱:\n${apps.join('\n')}`;
}

// 시간 범위 미지정 시: 사용자 선호 기본값
function getDefaultTimeRange(userMemory: UserMemory | null): string {
  return userMemory?.preferredTimeRange || '7d';
}
```

## 4. Tier 3: Organization Memory (조직 지식)

YAML 파일 기반 (이미 정의됨) + 앱별 도메인 노트:

```yaml
# settings/app-notes.yaml — 앱별 도메인 지식
apps:
  123:   # 쿠팡
    notes:
      - "purchase 이벤트는 실결제만 포함 (장바구니 제외)"
      - "2026-03-15에 SDK v4로 마이그레이션 — 이전 데이터와 이벤트명 다름"
      - "test_ 로 시작하는 이벤트는 QA 데이터"
    specialFilters:
      - "event_name NOT LIKE 'test_%'"  # QA 데이터 자동 제외
    contacts:
      - "@coupang-data-team"

  456:   # 무신사
    notes:
      - "주말 트래픽이 평일 3배 — 이상치 판단 시 요일 보정 필요"
    specialFilters: []
```

```typescript
// SQL Agent에 앱 노트 자동 주입
function injectAppNotes(systemPrompt: string, appId: number): string {
  const notes = loadConfig('app-notes');
  const appNotes = notes.apps[appId];
  if (!appNotes?.notes?.length) return systemPrompt;

  return systemPrompt + `

## 이 앱(${appId}) 참고사항
${appNotes.notes.map(n => `- ${n}`).join('\n')}
${appNotes.specialFilters?.length
  ? `\n자동 적용 필터:\n${appNotes.specialFilters.map(f => `- ${f}`).join('\n')}`
  : ''}`;
}
```

## 5. 메모리 → 프롬프트 주입 전략

```
System Prompt (캐싱 가능)
  ├── 기본 instructions
  ├── Semantic Layer (Tier 3, relevance filtered)
  ├── Domain Glossary (Tier 3, top 10)
  └── 앱 노트 (Tier 3, 앱 컨텍스트 있을 때)

Dynamic Context (요청마다)
  ├── 세션 히스토리 (Tier 1, 최근 3턴)
  ├── 사용자 선호 (Tier 2, 기본 앱/시간 범위)
  ├── Few-shot 예시 (Tier 3, 유사 질문 5개)
  └── 이전 StepResult (Orchestrator 경유 시)

User Message
  └── 전처리된 질문
```

**Context 예산 내에서 우선순위**: instructions > semantic layer > 앱 노트 > 세션 > few-shot > 사용자 선호

## 6. 메모리 정리 정책

| Tier | TTL | 정리 방식 |
|------|-----|----------|
| Working Memory | 30분 비활성 | Redis TTL 자동 만료 |
| User Memory | 30일 비활동 | Redis TTL, 활동 시 갱신 |
| App Notes | 영구 | 수동 관리 (YAML) |
| Few-shot | 영구 | 주간 큐레이션에서 정리 |
| Golden Dataset | 영구 | 수동 관리 |

## 7. 설계 결정 이유

| 결정 | 이유 |
|------|------|
| 3-tier 분리 | 수명과 범위가 다른 정보를 적절히 관리 |
| Redis 기반 Tier 1-2 | Lambda stateless + TTL 자동 만료 |
| YAML 기반 Tier 3 | 버전 관리 가능 + 코드 리뷰 가능 |
| 앱 노트 (app-notes.yaml) | 앱별 도메인 지식이 SQL 정확도에 직접 영향 |
| 자동 필터 주입 | QA 데이터 등을 매번 수동 제외하는 번거로움 방지 |
| 사용자 선호 자동 학습 | 명시적 설정 없이 행동 기반 학습 — 사용자 부담 0 |
