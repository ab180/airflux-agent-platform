# Korean NLU & Ambiguity Resolution

> 한국어 자연어 이해 특화 전략, 모호성 해결, 줄임말/혼용 처리

## 1. 한국어 특유 과제

| 과제 | 예시 | 해결 전략 |
|------|------|----------|
| 줄임말/약어 | "dau", "디에이유", "DAU" | Domain Glossary aliases |
| 한영 혼용 | "purchase 이벤트 수" | LLM이 자연스럽게 처리 |
| 주어 생략 | "이벤트 수 알려줘" (어떤 앱?) | App Context 4단계 해결 |
| 시간 모호성 | "최근", "지난번", "요즘" | 기본값 규칙 |
| 오타/유사어 | "dua", "리텐선", "에트리뷰션" | Fuzzy matching |
| 존댓말/반말 혼용 | "알려줘", "알려주세요" | 응답은 항상 존댓말 |
| 복합 의도 | "이벤트 왜 줄었는지 차트로" | Router multi-agent |

## 2. Domain Glossary 활용

```yaml
# settings/domain-glossary.yaml — 한국어 특화
terms:
  - term: "DAU"
    aliases: ["dau", "디에이유", "일일활성사용자", "하루사용자", "일간유저"]
    definition: "하루 동안 앱을 사용한 고유 사용자 수"

  - term: "어트리뷰션"
    aliases: ["attribution", "기여", "어트리뷰선", "에트리뷰션"]  # 오타 포함
    definition: "사용자의 앱 설치/전환이 어떤 마케팅 채널에서 발생했는지 판별"

  - term: "리텐션"
    aliases: ["retention", "잔존율", "리텐선", "잔존", "D7", "D30"]
    definition: "설치 후 N일 뒤 다시 앱을 사용한 비율"

  - term: "퍼널"
    aliases: ["funnel", "깔때기", "전환율", "컨버전"]
    definition: "단계별 사용자 전환 흐름"
```

## 3. 시간 표현 정규화

```typescript
const TIME_MAPPINGS: Record<string, string> = {
  // 명시적
  '오늘': '1d',
  '어제': '1d',  // DATEADD(day, -1, ...)
  '이번 주': '7d',
  '지난 주': '7d',  // 이전 7일
  '이번 달': '30d',
  '지난 달': '30d',

  // 모호한 표현 → 기본값
  '최근': '7d',
  '요즘': '7d',
  '얼마전': '7d',
  '지난번': '7d',

  // 구체적 기간
  '3일': '3d',
  '일주일': '7d',
  '한 달': '30d',
  '분기': '90d',
};

function normalizeTimeExpression(question: string): { timeRange: string; modified: string } {
  for (const [korean, range] of Object.entries(TIME_MAPPINGS)) {
    if (question.includes(korean)) {
      return { timeRange: range, modified: question };
    }
  }
  return { timeRange: '7d', modified: question };  // 기본 7일
}
```

## 4. Fuzzy Matching (오타 처리)

```typescript
// 편집 거리 기반 가장 가까운 용어 찾기
function findClosestTerm(input: string, glossary: Term[]): Term | null {
  let bestMatch: Term | null = null;
  let bestDistance = Infinity;

  const allNames: Array<{ term: Term; name: string }> = [];
  for (const term of glossary) {
    allNames.push({ term, name: term.term });
    for (const alias of term.aliases || []) {
      allNames.push({ term, name: alias });
    }
  }

  for (const { term, name } of allNames) {
    const distance = levenshteinDistance(input.toLowerCase(), name.toLowerCase());
    // 편집 거리 2 이내만 매칭 (너무 다른 건 무시)
    if (distance <= 2 && distance < bestDistance) {
      bestDistance = distance;
      bestMatch = term;
    }
  }

  return bestMatch;
}

// 사용: SQL Agent가 알 수 없는 용어를 만나면
// "리텐선" → levenshtein("리텐선", "리텐션") = 1 → "리텐션" 매칭
```

## 5. 모호성 해결 프로토콜

에이전트가 질문을 이해하지 못했을 때의 3단계 해결:

```
Level 1: 자동 해결 (사용자 개입 없음)
  - 오타 → fuzzy matching
  - 시간 모호 → 기본 7일
  - 앱 미지정 → 세션/채널 컨텍스트

Level 2: 확인 요청 (선택지 제공)
  "혹시 다음 중 하나를 의미하시나요?"
  [DAU] [MAU] [이벤트 수]

Level 3: 자유 입력 요청
  "어떤 데이터를 조회하고 싶으신지 더 구체적으로 알려주세요.
  예: '앱 123의 지난 7일 DAU'"
```

```typescript
// Router Agent가 confidence 기반으로 결정
interface RouterDecision {
  agents: string[];
  confidence: 'high' | 'medium' | 'low';
  clarificationNeeded?: {
    type: 'select' | 'freeform';
    options?: string[];  // select일 때
    message: string;
  };
}

// confidence별 동작
async function handleRouterDecision(
  decision: RouterDecision,
  context: AgentContext,
): Promise<void> {
  if (decision.confidence === 'high') {
    // 바로 실행
    await executeOrchestration(decision.agents, context);
  } else if (decision.confidence === 'medium' && decision.clarificationNeeded?.type === 'select') {
    // 선택지 제공 (Slack: 버튼, API: options 배열)
    await context.responseChannel.sendClarification(decision.clarificationNeeded);
  } else {
    // 자유 입력 요청
    await context.responseChannel.sendResult({
      summary: decision.clarificationNeeded?.message || '질문을 더 구체적으로 해주세요.',
      confidence: 'low',
      followUpSuggestions: ['앱 123의 지난 7일 DAU', '이번 주 이벤트 추이'],
      metadata: { agentType: 'router', model: '', latencyMs: 0, costUsd: 0, traceId: context.traceId, cached: false },
    });
  }
}
```

## 6. 응답 언어 규칙

```yaml
# 프롬프트 규칙 (모든 에이전트 공통)
응답 언어 규칙:
  - 항상 한국어로 답변 (기술 용어는 영어 허용: DAU, SDK, API 등)
  - 존댓말 사용 (~합니다, ~입니다)
  - 숫자 포맷: 한국어 단위 (1,234명, 5.6%, ₩1,234,567)
  - 날짜 포맷: YYYY-MM-DD 또는 "4월 2일 (수)"
  - SQL 컬럼명은 한국어 alias 사용 (AS "일별 이벤트 수")
  - 간결하게, 핵심부터 (결론 → 근거 → 상세)
```

## 7. 설계 결정 이유

| 결정 | 이유 |
|------|------|
| Glossary에 오타 포함 | 오타를 미리 등록하면 fuzzy 비용 절감 |
| 편집 거리 2 이내 | 3 이상은 다른 단어일 가능성 높음 |
| 기본 시간 7일 | 너무 짧으면 데이터 부족, 너무 길면 쿼리 비용 — 7일이 균형 |
| 3단계 모호성 해결 | 자동 → 선택 → 자유 순서로 사용자 부담 최소화 |
| 존댓말 강제 | 사내 도구지만 전문적 톤 유지 |
