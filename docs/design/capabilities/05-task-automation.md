# Task Automation

> 일상 반복 작업을 자동화하는 에이전트 기능

## 자동화 대상

| 작업 | 트리거 | 에이전트 | 출력 |
|------|--------|---------|------|
| 앱 상태 조회 | Slack `/status app123` | SQL Agent | 앱 기본 정보 + 최근 이벤트 현황 |
| 고객 문의 지원 | CS 팀 Slack 멘션 | SQL + Insight | 앱 진단 결과 + 권장 액션 |
| SDK 연동 확인 | Webhook (앱 생성) | SQL Agent | SDK 버전, 이벤트 수신 여부 |
| 데이터 export | API 요청 | SQL Agent | S3 CSV + Presigned URL |
| 지표 모니터링 | Cron (매 시간) | Insight Agent | 임계값 초과 시 알림 |

## 작업 자동화 패턴

### 1. 슬래시 명령 기반 (즉시 응답)

```typescript
// Slack: /status myapp
// → SQL Agent가 앱 정보 + 최근 7일 이벤트 요약 반환
// 소요시간: 3-5초

// 구현: gateway → router (skip, 단순 명령) → SQL Agent → Slack 응답
```

### 2. 멘션 기반 (대화형)

```typescript
// Slack: @airflux 이 앱 purchase 이벤트가 안 들어오는 것 같은데?
// → SQL Agent (이벤트 조회) → Insight Agent (원인 분석) → 스레드 응답
// → 후속 질문: "언제부터?" → 세션 컨텍스트로 이어서 분석

// 구현: Chat SDK onNewMention → Router Agent → Multi-Agent → Slack 스레드
```

### 3. 데이터 Export (비동기)

```typescript
// API: POST /api/export { query: "앱 123의 3월 전체 이벤트", format: "csv" }
// → SQL Agent (쿼리 생성) → Snowflake (COPY INTO S3) → Presigned URL 반환
// 소요시간: 30초-5분 (데이터 크기에 따라)

async function handleExport(context: AgentContext): Promise<void> {
  const sql = await sqlAgent.generate({ ... });

  // 대용량: Snowflake COPY INTO로 직접 S3에 저장
  const s3Key = `exports/${context.sessionId}/${Date.now()}.csv`;
  await snowflake.execute(`
    COPY INTO 's3://airflux-exports/${s3Key}'
    FROM (${sql.text})
    FILE_FORMAT = (TYPE = CSV HEADER = TRUE)
  `);

  const url = await getPresignedUrl(s3Key, 24 * 60 * 60); // 24시간 유효
  await context.responseChannel.sendResult({
    summary: '데이터 Export 완료',
    downloadUrl: url,
    rowCount: await getRowCount(sql.text),
  });
}
```

### 4. 임계값 모니터링 (Cron)

```yaml
# settings/monitors.yaml
monitors:
  - name: "이벤트 수 급감 감지"
    schedule: "0 * * * *"  # 매 시간
    query: |
      SELECT app_id, COUNT(*) as hourly_count
      FROM events
      WHERE event_timestamp >= DATEADD(hour, -1, CURRENT_TIMESTAMP())
      GROUP BY app_id
    threshold:
      type: "drop_percent"
      baseline: "24h_avg"
      value: 50  # 50% 이상 감소 시
    alert:
      channel: "#airflux-alerts"
      mention: "@oncall"

  - name: "에러 이벤트 급증"
    schedule: "*/15 * * * *"  # 15분마다
    query: |
      SELECT app_id, COUNT(*) as error_count
      FROM events
      WHERE event_name = 'error'
        AND event_timestamp >= DATEADD(minute, -15, CURRENT_TIMESTAMP())
      GROUP BY app_id
      HAVING error_count > 100
    alert:
      channel: "#airflux-errors"
```

## MCP Server (Claude Code 연동)

개발자가 Claude Code에서 직접 Airflux 데이터에 접근:

```typescript
// Airflux MCP Server — Claude Code에서 사용
// claude mcp add airflux https://airflux-mcp.internal.ab180.co

// Tools:
// - query_airflux: 자연어로 Airflux 데이터 조회
// - get_app_status: 앱 상태 조회
// - list_events: 이벤트 목록 조회
// - get_schema: 테이블 스키마 조회

// 사용 예:
// Claude Code에서: "airflux에서 앱 123의 어제 이벤트 수 조회해줘"
// → MCP Tool call → SQL Agent → 결과 반환
```
