# Data Export & Notification System

> CSV/Excel Export, 스케줄 알림, Webhook 통보

## 1. Export 파이프라인

### 1.1 Export 트리거

| 트리거 | 경로 | 예시 |
|--------|------|------|
| Slack 버튼 | 결과 메시지의 "📥 CSV 다운로드" 클릭 | 조회 결과 10행 이상 시 표시 |
| Slack 명령 | `/airflux export 앱 123 이벤트 3월` | 명시적 Export 요청 |
| API | `POST /api/export` | 대시보드에서 Export |
| Cron | 주간 리포트에 CSV 첨부 | 자동 첨부 |

### 1.2 Export 흐름

```
Export 요청
  ↓
SQL Agent → SQL 생성 (또는 이전 쿼리 재사용)
  ↓
행 수 확인
  ├── <= 10,000행: Lambda 내에서 직접 CSV 생성
  └── > 10,000행: Snowflake COPY INTO S3
  ↓
S3 업로드 (Presigned URL, 24시간 유효)
  ↓
ResponseChannel로 다운로드 링크 전달
  ├── Slack: "📥 다운로드 (1.2MB, 15,234행)" 버튼
  ├── API: { downloadUrl, rowCount, fileSize, expiresAt }
  └── Cron: 리포트 HTML에 링크 포함
```

### 1.3 구현

```typescript
interface ExportResult {
  downloadUrl: string;
  rowCount: number;
  fileSize: number;       // bytes
  format: 'csv' | 'xlsx';
  expiresAt: string;      // ISO date
}

async function exportData(
  sql: string,
  format: 'csv' | 'xlsx' = 'csv',
  context: AgentContext,
): Promise<ExportResult> {
  // 행 수 확인
  const countResult = await snowflake.execute(`SELECT COUNT(*) as cnt FROM (${sql})`);
  const rowCount = countResult.rows[0].cnt;

  if (rowCount > 100_000) {
    throw new AirfluxError('SQL-EXEC-001', { reason: '10만 행 초과 — 기간을 좁혀주세요' });
  }

  const s3Key = `exports/${context.userId}/${Date.now()}.${format}`;

  if (rowCount > 10_000) {
    // Snowflake COPY INTO — 대용량 최적화
    await snowflake.execute(`
      COPY INTO 's3://airflux-exports/${s3Key}'
      FROM (${sql})
      FILE_FORMAT = (TYPE = CSV HEADER = TRUE COMPRESSION = GZIP)
      SINGLE = TRUE
      MAX_FILE_SIZE = 100000000
    `);
  } else {
    // Lambda 내 직접 생성 — 소량 빠른 응답
    const result = await snowflake.execute(sql);
    const csvContent = generateCsv(result.headers, result.rows);
    await s3.putObject({
      Bucket: 'airflux-exports',
      Key: s3Key,
      Body: format === 'csv' ? csvContent : await convertToXlsx(csvContent),
      ContentType: format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  const downloadUrl = await getPresignedUrl('airflux-exports', s3Key, 24 * 60 * 60);
  const fileSize = await getObjectSize('airflux-exports', s3Key);

  // Audit 기록
  auditLogger.logQuery({
    ...context,
    action: 'export',
    rowsReturned: rowCount,
  });

  return { downloadUrl, rowCount, fileSize, format, expiresAt: new Date(Date.now() + 86400000).toISOString() };
}
```

### 1.4 보안

- Presigned URL 24시간 만료
- Export도 guardrail 적용 (PII 컬럼 차단)
- RBAC: `canExport: true` 역할만 허용
- 10만 행 hard limit (비용 + 메모리 보호)
- Audit log에 Export 이력 기록

---

## 2. Notification 시스템

### 2.1 알림 유형

| 유형 | 트리거 | 대상 | 예시 |
|------|--------|------|------|
| 이상치 알림 | Cron 모니터링 | Slack 채널 | "앱 123 이벤트 50% 급감" |
| 임계값 알림 | monitors.yaml 규칙 | Slack + @멘션 | "에러율 5% 초과" |
| 예산 알림 | 비용 추적 | #airflux-costs | "일일 예산 80% 도달" |
| 리포트 알림 | Cron 리포트 완료 | Slack + S3 | "주간 리포트 생성 완료" |
| 스키마 변경 | 주간 스키마 diff | #airflux-schema | "새 컬럼 3개 감지" |
| 평가 drift | 일일 평가 | #airflux-alerts | "품질 점수 10% 하락" |

### 2.2 알림 전송 추상화

```typescript
interface NotificationChannel {
  send(notification: Notification): Promise<void>;
}

interface Notification {
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
  metadata?: Record<string, any>;
  actions?: NotificationAction[];
}

interface NotificationAction {
  label: string;
  url?: string;          // 링크 버튼
  actionId?: string;     // 인터랙션 버튼
}

// Slack 알림
class SlackNotificationChannel implements NotificationChannel {
  constructor(private channelId: string, private mention?: string) {}

  async send(notification: Notification): Promise<void> {
    const emoji = { info: 'ℹ️', warning: '⚠️', critical: '🚨' }[notification.severity];
    const mentionText = this.mention && notification.severity !== 'info'
      ? `\n${this.mention}`
      : '';

    await slack.chat.postMessage({
      channel: this.channelId,
      text: `${emoji} ${notification.title}${mentionText}`,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `${emoji} *${notification.title}*\n${notification.body}` } },
        ...(notification.actions?.length ? [{
          type: 'actions',
          elements: notification.actions.map(a => a.url
            ? { type: 'button', text: { type: 'plain_text', text: a.label }, url: a.url }
            : { type: 'button', text: { type: 'plain_text', text: a.label }, action_id: a.actionId }
          ),
        }] : []),
      ],
    });
  }
}

// Webhook 알림 (외부 시스템)
class WebhookNotificationChannel implements NotificationChannel {
  constructor(private url: string, private secret: string) {}

  async send(notification: Notification): Promise<void> {
    const body = JSON.stringify(notification);
    const signature = crypto.createHmac('sha256', this.secret).update(body).digest('hex');
    await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Airflux-Signature': signature,
      },
      body,
    });
  }
}
```

### 2.3 알림 규칙 엔진

monitors.yaml의 규칙을 실행하는 엔진:

```typescript
async function evaluateMonitors(): Promise<void> {
  const monitors = await loadConfig('monitors');

  for (const monitor of monitors.monitors) {
    try {
      // SQL 실행
      const result = await snowflake.execute(monitor.query);

      // 임계값 비교
      const violations = evaluateThreshold(result.rows, monitor.threshold);

      if (violations.length > 0) {
        // 알림 전송
        const channel = new SlackNotificationChannel(
          monitor.alert.channel,
          monitor.alert.mention,
        );

        await channel.send({
          title: monitor.name,
          body: formatViolations(violations),
          severity: violations.some(v => v.severity === 'critical') ? 'critical' : 'warning',
          actions: [{ label: '상세 보기', actionId: `monitor_detail_${monitor.name}` }],
        });
      }

      logger.info('monitor_evaluated', {
        monitor: monitor.name,
        violations: violations.length,
      });
    } catch (error) {
      logger.error('monitor_error', error as Error, { monitor: monitor.name });
    }
  }
}
```

## 3. 설계 결정 이유

| 결정 | 이유 |
|------|------|
| Snowflake COPY INTO (대량) | Lambda 메모리 제한 우회, 대용량 최적 |
| Lambda 직접 CSV (소량) | 10K행 이하는 빠른 응답이 더 중요 |
| 10만 행 hard limit | Snowflake 비용 + S3 저장 비용 관리 |
| Presigned URL 24시간 | 영구 URL은 보안 위험 — 24시간이면 충분 |
| 알림 추상화 (NotificationChannel) | Slack 외 Webhook, 이메일 등 확장 가능 |
| monitors.yaml 규칙 엔진 | 코드 변경 없이 모니터링 규칙 추가/수정 |
