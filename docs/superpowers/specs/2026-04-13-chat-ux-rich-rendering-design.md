# Chat UX Rich Rendering Design

> Date: 2026-04-13
> Status: Approved

## Problem

현재 `/chat` 페이지는 에이전트 응답을 `whitespace-pre-wrap` 평문으로만 표시.
백엔드는 마크다운, 도구 호출 내역, 구조화된 데이터를 반환하지만 전부 무시됨.
"DAU 추이 보여줘" 같은 질문에 텍스트 나열만 표시되어 가치가 낮음.

## Solution

3단계 리치 렌더링:

### 1. 마크다운 렌더링
- `react-markdown` + `remark-gfm` + `rehype-highlight`
- GFM 테이블, 코드 블록 (syntax highlight), 볼드/이탤릭/리스트
- 기존 `<p className="whitespace-pre-wrap">` → `<ReactMarkdown>` 교체

### 2. 도구 사용 시각화 (아코디언)
- 메시지 상단에 사용된 도구 목록 표시
- 기본: 접힌 상태 `🔧 toolName ✓ (23ms)`
- 클릭: 펼쳐서 도구 입력/출력 상세 (가능한 경우)
- `metadata.toolCalls` 배열에서 렌더

### 3. 데이터 차트 (recharts)
- 에이전트가 `data` 필드에 구조화된 데이터를 반환하면 자동 차트 렌더
- 지원 차트: 라인, 바, 파이 (데이터 구조로 자동 판별)
- 차트 데이터 포맷: `{ type: "line"|"bar"|"pie", labels: string[], datasets: [...] }`
- 차트가 없으면 기존대로 텍스트만 표시

## Implementation

### 의존성
```bash
cd apps/dashboard && npm install react-markdown remark-gfm rehype-highlight recharts
```

### 파일 변경

| 파일 | 변경 |
|------|------|
| `components/chat/chat-message.tsx` (신규) | 마크다운 렌더 + 도구 + 차트 통합 컴포넌트 |
| `components/chat/tool-accordion.tsx` (신규) | 도구 호출 아코디언 |
| `components/chat/data-chart.tsx` (신규) | recharts 기반 자동 차트 |
| `app/dashboard/playground/page.tsx` | Message 인터페이스 확장, ChatMessage 사용 |
| `app/chat/page.tsx` | playground 재사용 (변경 없음) |

### Message 인터페이스 확장

```typescript
interface Message {
  // 기존
  id, role, text, agent, traceId, durationMs, tokens, model, timestamp, feedbackSent
  // 추가
  toolCalls?: string[];      // ["getSemanticLayer", "normalizeTime"]
  steps?: number;            // 에이전트 실행 스텝 수
  data?: unknown;            // 구조화된 데이터 (차트용)
}
```

### 차트 데이터 포맷

```typescript
interface ChartData {
  type: "line" | "bar" | "pie";
  title?: string;
  data: Array<Record<string, string | number>>;
  xKey: string;      // x축 키
  yKeys: string[];   // y축 키(들)
}
```

## Verification

- `npm run build` 성공
- `/chat`에서 마크다운 포함 응답이 정상 렌더링
- 도구 사용 시 아코디언 표시 + 접기/펼치기 동작
- `data` 필드에 차트 데이터 포함 시 recharts 렌더링
- 기존 225 tests 통과
