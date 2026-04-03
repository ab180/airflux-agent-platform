# Response UX & Formatting

> 엔드포인트별 응답 포맷, 프로그레시브 디스클로저, 에러 UX

## 1. 엔드포인트별 응답 전략

같은 AgentResult를 엔드포인트별로 다르게 렌더링:

| 엔드포인트 | 포맷 | 제한 | 전략 |
|-----------|------|------|------|
| Slack | Block Kit JSON | 50블록, 3000자/블록 | 프로그레시브 디스클로저 + S3 overflow |
| REST API | JSON + SSE | 없음 | 전체 데이터 반환 + 스트리밍 |
| Cron Report | HTML → S3 | 없음 | 리치 포맷 + 인라인 차트 |
| Webhook | JSON POST | 대상에 따라 | 요약 + 상세 URL |

## 2. Slack 응답 포맷 (상세)

### 2.1 프로그레시브 디스클로저

Montgomery의 `ResponseFormatter.toSlackBlocks()` 패턴을 확장:

```
┌─────────────────────────────────────┐
│ 📊 요약 (항상 표시)                   │
│ "앱 123의 지난 7일 일별 이벤트 수입니다" │
├─────────────────────────────────────┤
│ ⚠️ 주의사항 (있을 때만)               │
│ "데이터가 2시간 전 기준입니다"         │
├─────────────────────────────────────┤
│ 💡 인사이트 (있을 때만, 최대 3개)     │
│ • 3/28에 이벤트 45% 급감 (Z: -3.1)  │
│ • 주말 패턴: 토~일 평균 30% 감소      │
├─────────────────────────────────────┤
│ 📋 데이터 테이블 (10행 이하 시 인라인) │
│ | 날짜  | 이벤트 수 | 변화율 |        │
│ | 4/01 | 12,345   | +5%   |        │
│ | 4/02 | 11,200   | -9%   |        │
├─────────────────────────────────────┤
│ 📈 차트 (있을 때만)                   │
│ [이미지: QuickChart URL]              │
├─────────────────────────────────────┤
│ 🔍 실행 SQL (투명성)                  │
│ ```SELECT DATE(event_timestamp)...```│
├─────────────────────────────────────┤
│ 🕐 데이터 기준: 2026-04-02 09:00 UTC │
├─────────────────────────────────────┤
│ [📝 후속질문1] [📝 후속질문2]          │
│ [📥 CSV 다운로드] [👍] [👎] [📝 피드백]│
└─────────────────────────────────────┘
```

### 2.2 대용량 결과 처리

```typescript
const SLACK_LIMITS = {
  maxBlocks: 50,
  maxTextPerBlock: 3000,
  maxTableRows: 10,        // 인라인 테이블 최대 행
  maxInsights: 3,
  maxFollowUps: 2,
  maxButtons: 5,
  maxMessageSize: 262144,  // 바이트
};

function formatForSlack(result: AgentResult, queryId: string): SlackMessage {
  const blocks: any[] = [];

  // 1. 요약 (항상)
  blocks.push(section(result.summary));

  // 2. 경고
  if (result.pipelineWarning) {
    blocks.push(context(`⚠️ ${result.pipelineWarning}`));
  }

  // 3. 인사이트
  if (result.insights?.length) {
    blocks.push(section('💡 *인사이트*'));
    result.insights.slice(0, SLACK_LIMITS.maxInsights).forEach(i =>
      blocks.push(section(`• ${i}`))
    );
  }

  // 4. 데이터 테이블
  if (result.dataTable) {
    if (result.dataTable.rows.length <= SLACK_LIMITS.maxTableRows) {
      blocks.push(section(formatMarkdownTable(result.dataTable)));
    } else {
      blocks.push(section(
        `📋 ${result.dataTable.rows.length}행 중 상위 ${SLACK_LIMITS.maxTableRows}행:\n` +
        formatMarkdownTable({
          headers: result.dataTable.headers,
          rows: result.dataTable.rows.slice(0, SLACK_LIMITS.maxTableRows),
        })
      ));
    }
  }

  // 5. 차트
  if (result.chart?.data) {
    blocks.push(image(result.chart.data, result.chart.title));
  }

  // 6. SQL (투명성)
  if (result.sql) {
    blocks.push(section(`🔍 실행 SQL:\n\`\`\`${result.sql}\`\`\``));
  }

  // 7. 데이터 기준 시각
  if (result.dataFreshness) {
    blocks.push(context(`🕐 데이터 기준: ${result.dataFreshness}`));
  }

  // 8. 액션 버튼
  const actions = buildActionButtons(result, queryId);
  if (actions.length) blocks.push({ type: 'actions', elements: actions });

  // 크기 체크 → 초과 시 S3로 우회
  const serialized = JSON.stringify(blocks);
  if (serialized.length > SLACK_LIMITS.maxMessageSize * 0.8) {
    return overflowToS3(result, queryId, blocks);
  }

  return { blocks, text: result.summary };
}

function overflowToS3(result: AgentResult, queryId: string, blocks: any[]): SlackMessage {
  // 전체 결과를 S3 HTML로 업로드
  const html = renderHtmlReport(result);
  const url = await uploadAndGetPresignedUrl(html, `results/${queryId}.html`);

  // Slack에는 요약 + 링크만
  return {
    blocks: [
      section(result.summary),
      section(`📊 전체 결과가 너무 큽니다. 상세 보기: ${url}`),
      ...blocks.slice(-1), // 액션 버튼만 유지
    ],
    text: result.summary,
  };
}
```

### 2.3 진행 상태 UX (Montgomery 이모지 패턴)

```
사용자: "지난 주 이벤트 추이 분석해줘"
  ↓
[즉시] 💭 (thought_balloon 이모지 추가)
  ↓
[1초] "🔄 질문을 분석하고 있습니다..."
  ↓
[3초] "🔄 SQL Agent가 데이터를 조회하고 있습니다..."
  ↓
[6초] "🔄 Insight Agent가 분석하고 있습니다..."
  ↓
[10초] 💭 제거 → ✅ 추가 + 결과 메시지 포스트
```

```typescript
class SlackProgressTracker {
  private statusMessageTs?: string;

  async start(channel: string, threadTs: string): Promise<void> {
    // 이모지 추가
    await this.slack.reactions.add({ channel, timestamp: threadTs, name: 'thought_balloon' });
    // 진행 메시지 포스트
    const res = await this.slack.chat.postMessage({
      channel, thread_ts: threadTs,
      text: '🔄 질문을 분석하고 있습니다...',
    });
    this.statusMessageTs = res.ts;
  }

  async update(status: string): Promise<void> {
    if (!this.statusMessageTs) return;
    await this.slack.chat.update({
      channel: this.channel,
      ts: this.statusMessageTs,
      text: `🔄 ${status}`,
    });
  }

  async complete(success: boolean): Promise<void> {
    // 이모지 전환
    try { await this.slack.reactions.remove({ name: 'thought_balloon', ... }); } catch {}
    await this.slack.reactions.add({ name: success ? 'white_check_mark' : 'x', ... });
    // 진행 메시지 삭제
    if (this.statusMessageTs) {
      try { await this.slack.chat.delete({ channel: this.channel, ts: this.statusMessageTs }); } catch {}
    }
  }
}
```

## 3. REST API 응답 포맷

### 3.1 동기 응답 (짧은 쿼리)

```typescript
// POST /api/query → 30초 이내 응답
interface ApiQueryResponse {
  status: 'success' | 'partial' | 'error';
  queryId: string;
  result: {
    summary: string;
    insights?: string[];
    dataTable?: { headers: string[]; rows: any[][] };
    chart?: { url: string; type: string };
    sql?: string;
    followUpSuggestions?: string[];
  };
  metadata: {
    agentsUsed: string[];
    latencyMs: number;
    costUsd: number;
    dataFreshness: string;
  };
  warnings?: string[];
}
```

### 3.2 SSE 스트리밍 (긴 분석)

```typescript
// POST /api/query/stream → Server-Sent Events
// Content-Type: text/event-stream

// 이벤트 유형:
data: {"type": "progress", "agent": "router", "message": "의도 분류 중..."}

data: {"type": "progress", "agent": "sql", "message": "SQL 실행 중..."}

data: {"type": "partial", "agent": "sql", "result": {"sql": "SELECT...", "rows": [...]}}

data: {"type": "progress", "agent": "insight", "message": "분석 중..."}

data: {"type": "partial", "agent": "insight", "result": {"anomalies": [...]}}

data: {"type": "complete", "result": { /* 전체 AgentResult */ }}
```

## 4. Cron Report 포맷

S3에 저장되는 HTML 리포트:

```typescript
function renderHtmlReport(result: AgentResult, reportConfig: CronReport): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>${reportConfig.name} — ${new Date().toISOString().split('T')[0]}</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f5f5f5; }
    .insight { background: #fff3cd; padding: 10px; margin: 8px 0; border-radius: 4px; }
    .anomaly { background: #f8d7da; }
    .chart { max-width: 100%; margin: 16px 0; }
    .sql { background: #f8f9fa; padding: 12px; font-family: monospace; font-size: 13px; overflow-x: auto; }
    .meta { color: #666; font-size: 13px; margin-top: 20px; }
  </style>
</head>
<body>
  <h1>${reportConfig.name}</h1>
  <p>${result.summary}</p>

  ${result.insights?.map(i => `<div class="insight">${i}</div>`).join('') || ''}

  ${result.chart ? `<img class="chart" src="${result.chart.data}" alt="${result.chart.title}">` : ''}

  ${result.dataTable ? renderHtmlTable(result.dataTable) : ''}

  ${result.sql ? `<details><summary>실행 SQL</summary><pre class="sql">${escapeHtml(result.sql)}</pre></details>` : ''}

  <div class="meta">
    생성: ${new Date().toISOString()}<br>
    에이전트: ${result.metadata.agentType}<br>
    데이터 기준: ${result.dataFreshness || 'N/A'}
  </div>
</body>
</html>`;
}
```

## 5. 후속 질문 생성

```typescript
function generateFollowUps(result: AgentResult): string[] {
  const suggestions: string[] = [];

  // 시계열 데이터 → 기간 변경 제안
  if (result.dataTable?.headers.some(h => h.includes('date') || h.includes('날짜'))) {
    suggestions.push('기간을 30일로 늘려서 보여줘');
  }

  // 이상치 발견 → 원인 분석 제안
  if (result.insights?.some(i => i.includes('급') || i.includes('이상'))) {
    suggestions.push('왜 이런 변화가 생겼는지 분석해줘');
  }

  // 테이블 데이터 → 시각화 제안
  if (result.dataTable && !result.chart) {
    suggestions.push('차트로 시각화해줘');
  }

  // 많은 행 → Export 제안
  if (result.dataTable && result.dataTable.rows.length > 10) {
    suggestions.push('CSV로 다운로드');
  }

  return suggestions.slice(0, 2);  // 최대 2개
}
```

## 6. 에러 UX

사용자가 보는 에러는 항상 **친절하고 actionable**:

| AirfluxError | 사용자 표시 | 제안 액션 |
|-------------|-----------|----------|
| SQL-GEN-001 | "질문을 이해하지 못했습니다" | "더 구체적으로 질문해보세요. 예: '앱 123의 지난 7일 DAU'" |
| SQL-EXEC-001 | "쿼리가 오래 걸립니다" | "기간을 7일 이내로 좁혀보세요" |
| SQL-EXEC-003 | "데이터가 없습니다" | "기간이나 조건을 확인해주세요" |
| GUARD-RO-001 | "데이터 수정은 불가합니다" | "조회 질문만 가능합니다" |
| GUARD-PII-001 | "개인정보 접근 불가" | "COUNT 등 집계 형태로 질문해주세요" |
| LLM-API-001 | "분석 서비스 오류" | "잠시 후 다시 시도해주세요" |
| AUTH-BUDGET-001 | "오늘 사용량 초과" | "내일 다시 이용해주세요" |

```typescript
// Slack 에러 메시지 포맷
function formatErrorForSlack(error: AirfluxError): SlackMessage {
  return {
    blocks: [
      section(`❌ ${error.userMessage}`),
      ...(error.suggestion ? [context(`💡 ${error.suggestion}`)] : []),
      context(`코드: ${error.code} | 문의: #airflux-support`),
    ],
    text: error.userMessage,
  };
}
```

## 7. 설계 결정 이유

| 결정 | 이유 |
|------|------|
| 프로그레시브 디스클로저 | Slack 50블록 제한 + 정보 과부하 방지 |
| S3 overflow | 262KB Slack 메시지 제한 우회 (Montgomery 패턴) |
| 진행 메시지 삭제 | 최종 결과만 스레드에 남기면 깔끔 |
| SSE 스트리밍 (API) | 긴 분석 시 사용자가 진행 상황을 실시간 확인 |
| 후속 질문 자동 생성 | 사용자가 다음 행동을 쉽게 선택 → 참여도 증가 |
| 에러에 제안 액션 | "실패했습니다"보다 "이렇게 해보세요"가 유용 |
