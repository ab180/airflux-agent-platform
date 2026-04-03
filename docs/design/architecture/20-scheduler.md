# Scheduler System

> 에이전트 자동 실행: Cron 스케줄, Webhook 트리거, agents.yaml 연동

## 1. 스케줄의 두 가지 소스

```
1. agents.yaml의 schedule 필드 → 에이전트별 자동 실행
2. schedules 테이블 (대시보드에서 생성) → 독립 스케줄

둘 다 같은 Scheduler가 처리
```

## 2. agents.yaml 스케줄

```yaml
- name: research-agent
  schedule:
    - name: "일일 이상치 리포트"
      cron: "0 9 * * *"          # 매일 09:00
      question: "지난 24시간 주요 앱 이상치 분석"
      channels:
        - type: slack
          target: "#airflux-alerts"
        - type: s3
          target: "reports/daily/"
      enabled: true
      timeout: 300                # 5분

    - name: "주간 요약"
      cron: "0 10 * * 1"         # 매주 월 10:00
      question: "지난 주 주요 지표 요약 및 전주 대비 변화"
      channels:
        - type: slack
          target: "#airflux-weekly"
      enabled: true
      timeout: 600                # 10분
```

## 3. Scheduler 구현

### 3.1 로컬 (node-cron)

```typescript
import cron from 'node-cron';

class Scheduler {
  private jobs = new Map<string, cron.ScheduledTask>();

  async initialize(): Promise<void> {
    // 1. agents.yaml에서 스케줄 로드
    const agents = await loadConfig<AgentConfig[]>('agents');
    for (const agent of agents) {
      if (!agent.schedule) continue;
      for (const schedule of agent.schedule) {
        if (!schedule.enabled) continue;
        this.registerJob(agent.name, schedule);
      }
    }

    // 2. DB/파일에서 독립 스케줄 로드 (대시보드에서 생성된 것)
    const customSchedules = await loadSchedules();
    for (const schedule of customSchedules) {
      if (!schedule.enabled) continue;
      this.registerJob(schedule.agentName, schedule);
    }

    logger.info('scheduler_initialized', { jobs: this.jobs.size });
  }

  private registerJob(agentName: string, schedule: ScheduleConfig): void {
    const jobId = `${agentName}:${schedule.name}`;

    const task = cron.schedule(schedule.cron, async () => {
      logger.info('schedule_triggered', { jobId, agent: agentName });

      try {
        const context: AgentContext = {
          question: schedule.question,
          userId: 'system',
          sessionId: `cron-${jobId}-${Date.now()}`,
          source: 'cron',
          traceId: crypto.randomUUID(),
          debug: false,
          explain: false,
        };

        // ResponseChannel: 스케줄의 channels 설정에 따라 생성
        const channels = schedule.channels.map(ch => createChannel(ch));
        const responseChannel = channels.length === 1
          ? channels[0]
          : new MultiResponseChannel(channels);

        // Router → Orchestrator → 에이전트 실행
        await executeAgent(context, responseChannel);

        // 실행 기록
        await updateScheduleLastRun(jobId, 'success');

      } catch (error) {
        logger.error('schedule_error', error as Error, { jobId });
        await updateScheduleLastRun(jobId, 'error', String(error));

        // 에러 알림
        await notifyScheduleError(jobId, error);
      }
    }, { timezone: 'Asia/Seoul' });

    this.jobs.set(jobId, task);
  }

  // 대시보드에서 호출
  pauseJob(jobId: string): void {
    this.jobs.get(jobId)?.stop();
  }

  resumeJob(jobId: string): void {
    this.jobs.get(jobId)?.start();
  }

  runNow(jobId: string): Promise<void> {
    // 즉시 실행 (Cron 무시)
    const [agentName, scheduleName] = jobId.split(':');
    // ... executeAgent 로직
  }

  listJobs(): ScheduleStatus[] {
    return Array.from(this.jobs.entries()).map(([id, task]) => ({
      id,
      running: task.running,
      // ...
    }));
  }
}
```

### 3.2 인프라 (SST Cron / CloudWatch Events)

인프라에서는 node-cron 대신 SST의 Cron 또는 CloudWatch Events 사용:

```typescript
// sst.config.ts
// agents.yaml의 스케줄을 SST Cron으로 변환

const schedules = loadSchedulesFromYaml();
for (const schedule of schedules) {
  new sst.aws.Cron(`Schedule-${schedule.name}`, {
    schedule: `cron(${convertToAwsCron(schedule.cron)})`,
    function: {
      handler: 'src/endpoints/cron.handler',
      environment: {
        SCHEDULE_ID: schedule.id,
        SCHEDULE_AGENT: schedule.agentName,
        SCHEDULE_QUESTION: schedule.question,
        ...commonEnv,
      },
    },
  });
}
```

### 3.3 환경별 전환

```typescript
// 로컬: node-cron (프로세스 내)
// 인프라: SST Cron (CloudWatch Events → Lambda)

const scheduler = process.env.AWS_LAMBDA_FUNCTION_NAME
  ? new LambdaCronScheduler()   // 인프라에서는 SST가 처리
  : new LocalCronScheduler();    // 로컬에서는 node-cron
```

## 4. Webhook 트리거

외부 이벤트로 에이전트 자동 실행:

```yaml
# settings/webhooks.yaml
webhooks:
  - name: "신규 앱 생성 시 분석"
    event: "app.created"
    agent: research-agent
    question: "앱 {appId}의 초기 상태 분석 및 온보딩 가이드 생성"
    channels:
      - type: slack
        target: "#airflux-onboarding"
    secret: "${WEBHOOK_SECRET}"

  - name: "SDK 에러 급증 시"
    event: "alert.sdk_errors"
    agent: research-agent
    question: "앱 {appId}의 SDK 에러 원인 분석"
    channels:
      - type: slack
        target: "#airflux-alerts"
```

```typescript
// src/endpoints/webhook.ts
async function handleWebhook(req: Request): Promise<Response> {
  // 1. 서명 검증
  const signature = req.headers.get('x-webhook-signature');
  if (!verifyWebhookSignature(await req.text(), signature, WEBHOOK_SECRET)) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. 이벤트 매칭
  const event = JSON.parse(await req.text());
  const webhookConfig = findMatchingWebhook(event.type);
  if (!webhookConfig) {
    return new Response('No handler', { status: 200 });
  }

  // 3. 질문 템플릿에 변수 주입
  const question = webhookConfig.question.replace(
    /\{(\w+)\}/g,
    (_, key) => event.data[key] || `{${key}}`
  );

  // 4. 에이전트 실행 (비동기)
  const context: AgentContext = {
    question,
    userId: 'webhook',
    source: 'webhook',
    traceId: crypto.randomUUID(),
    metadata: { webhookEvent: event.type, webhookData: event.data },
  };

  // Worker에 위임 (즉시 응답)
  await invokeWorker(context);

  return new Response('OK', { status: 200 });
}
```

## 5. 스케줄 모니터링

```typescript
interface ScheduleStatus {
  id: string;
  agentName: string;
  scheduleName: string;
  cron: string;
  enabled: boolean;
  lastRunAt?: string;
  lastRunStatus?: 'success' | 'error';
  lastRunError?: string;
  nextRunAt: string;
  consecutiveFailures: number;
}

// 연속 실패 시 자동 비활성화
async function checkScheduleHealth(jobId: string): Promise<void> {
  const status = await getScheduleStatus(jobId);
  if (status.consecutiveFailures >= 3) {
    await pauseSchedule(jobId);
    await notifyScheduleAutoDisabled(jobId, status);
    logger.warn('schedule_auto_disabled', { jobId, failures: status.consecutiveFailures });
  }
}
```

## 6. 대시보드 연동

대시보드의 /schedules 페이지에서:
- 스케줄 목록 조회 (`GET /api/admin/schedules`)
- 즉시 실행 (`POST /api/admin/schedules/:id/run`)
- 일시 중지/재개 (`POST /api/admin/schedules/:id/pause|resume`)
- 새 스케줄 생성 (`POST /api/admin/schedules`)
- 실행 이력 조회 (`GET /api/admin/schedules/:id/history`)

## 7. 설계 결정 이유

| 결정 | 이유 |
|------|------|
| agents.yaml에 schedule 필드 | 에이전트와 스케줄이 함께 정의되어 관리 편함 |
| 로컬 node-cron / 인프라 SST Cron | 같은 설정, 다른 실행 환경 — 코드 변경 없이 전환 |
| Webhook 템플릿 변수 | `{appId}` 같은 동적 값 주입 — 유연한 자동화 |
| 연속 3회 실패 시 자동 비활성화 | 반복 실패로 비용/알림 낭비 방지 |
| MultiResponseChannel | 하나의 스케줄이 Slack + S3 동시 전달 |
