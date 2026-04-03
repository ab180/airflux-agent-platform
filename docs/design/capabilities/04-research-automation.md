# Research Automation

> 데이터 기반 연구/분석을 자동화하는 DurableAgent 워크플로우

## 사용 시나리오

| 시나리오 | 트리거 | 소요시간 | 출력 |
|---------|--------|---------|------|
| 신규 앱 온보딩 분석 | Webhook (앱 생성 이벤트) | 5-10분 | Slack + S3 리포트 |
| 주간 퍼포먼스 리뷰 | Cron (매주 월요일) | 10-15분 | Slack + S3 + 차트 |
| Ad-hoc 심층 분석 | Slack 명령 / API | 3-5분 | Slack 스레드 |
| 이벤트 드리프트 감지 | Cron (매일) | 5분 | Slack 알림 |

## DurableAgent 워크플로우 예시

### 신규 앱 온보딩 분석

```typescript
// workflows/app-onboarding-analysis.ts
import { createWorkflow } from '@workflow/core';
import { DurableAgent } from '@workflow/ai/agent';

export async function appOnboardingAnalysis(context) {
  'use workflow';
  const { appId, appName } = context.input;

    // Step 1: 기본 데이터 수집
    const basicStats = await context.step('collect-basic-stats', async () => {
      'use step';
      return await sqlAgent.generate({
        messages: [{
          role: 'user',
          content: `앱 ${appId}의 최근 7일 기본 통계: 총 이벤트 수, 일별 추이, 상위 이벤트 5개`,
        }],
      });
    });

    // Step 2: SDK 연동 상태 확인
    const sdkStatus = await context.step('check-sdk-status', async () => {
      'use step';
      return await sqlAgent.generate({
        messages: [{
          role: 'user',
          content: `앱 ${appId}의 SDK 버전 분포, 플랫폼별 이벤트 비율`,
        }],
      });
    });

    // Step 3: 동종 앱 벤치마크
    const benchmark = await context.step('benchmark', async () => {
      'use step';
      return await insightAgent.generate({
        messages: [{
          role: 'user',
          content: `앱 ${appId}를 비슷한 규모의 다른 앱들과 비교 분석`,
        }],
      });
    });

    // Step 4: 차트 생성
    const charts = await context.step('generate-charts', async () => {
      'use step';
      return await imageAgent.generate({
        messages: [{
          role: 'user',
          content: `다음 데이터로 온보딩 상태 대시보드 차트 3개 생성: ${basicStats.text}`,
        }],
      });
    });

    // Step 5: 종합 리포트 생성
    const report = await context.step('generate-report', async () => {
      'use step';
      return await generateText({
        model: 'anthropic/claude-sonnet-4.6',
        prompt: `
          다음 분석 결과를 종합하여 신규 앱 온보딩 리포트를 작성하세요.
          앱: ${appName} (ID: ${appId})
          기본 통계: ${basicStats.text}
          SDK 상태: ${sdkStatus.text}
          벤치마크: ${benchmark.text}

          리포트 형식:
          1. 요약 (3줄)
          2. 핵심 지표
          3. 잘 되고 있는 점
          4. 개선 필요 사항
          5. 권장 액션
        `,
      });
    });

    return { report: report.text, charts };
}
```

### 이벤트 드리프트 감지

기존에 수집되던 이벤트가 갑자기 사라지거나 새 이벤트가 등장하는 것을 자동 감지:

```typescript
export async function eventDriftDetection(context) {
  'use workflow';

    // Step 1: 앱별 이벤트 스키마 스냅샷 (7일전 vs 오늘)
    const drift = await context.step('detect-drift', async () => {
      'use step';
      const sql = `
        WITH baseline AS (
          SELECT app_id, event_name, COUNT(*) as cnt
          FROM events
          WHERE event_timestamp BETWEEN DATEADD(day, -14, CURRENT_DATE()) AND DATEADD(day, -7, CURRENT_DATE())
          GROUP BY app_id, event_name
        ),
        current AS (
          SELECT app_id, event_name, COUNT(*) as cnt
          FROM events
          WHERE event_timestamp >= DATEADD(day, -7, CURRENT_DATE())
          GROUP BY app_id, event_name
        )
        SELECT
          COALESCE(b.app_id, c.app_id) as app_id,
          COALESCE(b.event_name, c.event_name) as event_name,
          b.cnt as baseline_count,
          c.cnt as current_count,
          CASE
            WHEN b.cnt IS NULL THEN 'NEW'
            WHEN c.cnt IS NULL THEN 'DISAPPEARED'
            WHEN c.cnt < b.cnt * 0.5 THEN 'DECLINING'
            WHEN c.cnt > b.cnt * 2 THEN 'SURGING'
            ELSE 'STABLE'
          END as status
        FROM baseline b
        FULL OUTER JOIN current c ON b.app_id = c.app_id AND b.event_name = c.event_name
        WHERE status != 'STABLE'
        ORDER BY app_id, status
      `;
      return await snowflake.execute(sql);
    });

    // Step 2: 이상 항목이 있으면 알림
    if (drift.rows.length > 0) {
      await context.step('notify', async () => {
        'use step';
        // Insight Agent가 드리프트 요약 생성
        const summary = await insightAgent.generate({
          messages: [{ role: 'user', content: `이벤트 드리프트 분석: ${JSON.stringify(drift.rows)}` }],
        });
        // Slack 알림
        await slackNotify('#airflux-alerts', summary.text);
      });
    }
}
```

## 연구 자동화의 핵심

1. **DurableAgent**: 각 step이 독립적으로 재시도 가능. Lambda crash에도 안전.
2. **Multi-Agent 위임**: SQL Agent → Insight Agent → Image Agent 순차 실행.
3. **Cron + Webhook 트리거**: 사람이 요청하지 않아도 자동 실행.
4. **결과 다중 전달**: Slack 알림 + S3 리포트 + 대시보드 API 동시.
