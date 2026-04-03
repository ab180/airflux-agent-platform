# Admin Dashboard (Web)

> 에이전트/스킬/도구를 관리하는 웹 대시보드

## 1. 구조

```
Slack, API, Cron, Webhook, MCP  ←  사용자 인터페이스 (사용)
           ↕
     Agent Platform (Runtime)
           ↕
     Admin Dashboard (Web)      ←  관리자 인터페이스 (관리)
```

Slack은 **사용** 채널. 관리는 **웹 대시보드**에서.

## 2. 기술 스택

| 레이어 | 기술 | 이유 |
|--------|------|------|
| Frontend | Next.js App Router | AB180 내부 도구, SSR/RSC |
| UI | shadcn/ui + Tailwind | 빠른 개발, 깔끔한 UI |
| Auth | AB180 내부 SSO 또는 Clerk | 사내 인증 연동 |
| API | REST (Agent Platform의 API Gateway 공유) | 별도 백엔드 불필요 |
| 데이터 | Redis (실시간 상태) + CloudWatch (로그/메트릭) | 이미 존재하는 인프라 |

## 3. 대시보드 페이지 구조

```
/dashboard
├── /                           ← Overview (전체 현황)
├── /agents                     ← 에이전트 목록 + 관리
│   └── /agents/[name]          ← 에이전트 상세 + 설정
├── /skills                     ← 스킬 카탈로그
├── /tools                      ← 도구 목록
├── /schedules                  ← 자동 실행 스케줄 관리
├── /prompts                    ← 프롬프트 버전 관리 + 편집
├── /evaluation                 ← Golden Dataset + 평가 결과
├── /monitoring                 ← 비용, 지연시간, 에러율
├── /logs                       ← 요청 로그 (traceId 검색)
├── /feedback                   ← 사용자 피드백 목록
├── /users                      ← 사용자 + 권한 관리
└── /settings                   ← 글로벌 설정 (예산, rate limit)
```

## 4. 주요 페이지 상세

### 4.1 Overview (/)

```
┌─────────────────────────────────────────────────────┐
│  Airflux Agent Dashboard                             │
├─────────────────────────────────────────────────────┤
│                                                      │
│  오늘 요청: 234건    에러율: 1.2%    비용: $8.45     │
│  활성 에이전트: 5/7   평가 점수: 94.2%               │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐                 │
│  │ 요청 추이     │  │ 비용 추이     │                 │
│  │ (7일 차트)    │  │ (7일 차트)    │                 │
│  └──────────────┘  └──────────────┘                 │
│                                                      │
│  최근 알림:                                          │
│  ⚠️ Research Agent 지연시간 증가 (p95: 12s)          │
│  ✅ 일일 평가 통과 (94.2%)                           │
│                                                      │
│  에이전트별 사용량:                                    │
│  Data Agent   ████████████████ 45%                   │
│  Research     ████████ 22%                           │
│  Task         ██████ 18%                             │
│  Image        ████ 12%                               │
│  Other        ██ 3%                                  │
└─────────────────────────────────────────────────────┘
```

### 4.2 에이전트 관리 (/agents)

```
┌─────────────────────────────────────────────────────┐
│  Agents                                    [+ New]   │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │ ✅ Data Agent                                  │  │
│  │ Model: claude-sonnet-4.6  │ Skills: 3          │  │
│  │ 오늘: 102건  │  비용: $3.20  │  에러: 0.5%     │  │
│  │ [설정] [비활성화] [로그]                         │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │ ✅ Research Agent          🔄 스케줄 활성       │  │
│  │ Model: claude-sonnet-4.6  │ Skills: 3          │  │
│  │ 오늘: 45건  │  비용: $2.10  │  에러: 2.1%      │  │
│  │ 다음 자동 실행: 내일 09:00 (일일 이상치)        │  │
│  │ [설정] [비활성화] [로그] [스케줄]                │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │ ⛔ Digest Agent (비활성)                        │  │
│  │ Model: claude-haiku-4.5  │ Skills: 2           │  │
│  │ [활성화] [삭제]                                 │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 4.3 에이전트 상세 (/agents/[name])

```
┌─────────────────────────────────────────────────────┐
│  Data Agent                          [저장] [롤백]   │
├─────────────────────────────────────────────────────┤
│                                                      │
│  기본 설정:                                          │
│  ┌─────────────────────────────────────────────┐    │
│  │ 모델: [anthropic/claude-sonnet-4.6    ▼]     │    │
│  │ Fallback: [openai/gpt-5.4            ▼]     │    │
│  │ Max Steps: [5]                               │    │
│  │ Temperature: [0.0]                           │    │
│  │ 비용 한도/요청: [$0.10]                       │    │
│  │ 일일 예산: [$50.00]                           │    │
│  │ 프롬프트 버전: [v2.1 ▼]                       │    │
│  │ 활성화: [✅]                                  │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  스킬:                                               │
│  [✅ text-to-sql] [✅ chart-generation] [✅ export]  │
│  [⬜ anomaly-detect] [⬜ trend-analysis]  [+ 추가]  │
│                                                      │
│  도구 (자동 + 수동):                                  │
│  자동 (스킬에서): getSemanticLayer, executeQuery, ... │
│  수동 추가: [getDomainGlossary ×]  [+ 도구 추가]     │
│                                                      │
│  스케줄:                                              │
│  (없음)  [+ 스케줄 추가]                              │
│                                                      │
│  소스 제한:                                           │
│  [✅ Slack] [✅ API] [✅ Cron] [✅ Webhook]          │
│                                                      │
│  Feature Flag: insight_agent_enabled                 │
│  롤아웃: [100%]  허용 사용자: (전체)                   │
│                                                      │
│  ─── 최근 7일 지표 ───                               │
│  요청: 714건  │  비용: $22.40  │  에러율: 0.8%       │
│  p50: 2.1s  │  p95: 5.3s  │  p99: 8.7s             │
│  [요청 추이 차트]  [비용 추이 차트]                    │
└─────────────────────────────────────────────────────┘
```

### 4.4 프롬프트 편집 (/prompts)

```
┌─────────────────────────────────────────────────────┐
│  Prompts  │  Data Agent  │  v2.1 (current)          │
├─────────────────────────────────────────────────────┤
│                                                      │
│  버전 히스토리:                                       │
│  • v2.1 (current) — 2026-04-01 "집계 시 GROUP BY"   │
│  • v2.0 — 2026-03-25 "기본 규칙 추가"               │
│  • v1.0 (deprecated) — 2026-03-15 "초기 버전"       │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │ System Prompt (편집 가능):                    │    │
│  │                                              │    │
│  │ 당신은 Airflux 데이터 웨어하우스의 SQL 전문가│    │
│  │ 입니다.                                      │    │
│  │ Snowflake SQL을 생성하여 사용자 질문에 답합  │    │
│  │ 니다.                                        │    │
│  │                                              │    │
│  │ ## 테이블 및 메트릭                           │    │
│  │ {semantic_layer}                              │    │
│  │ ...                                          │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  플레이스홀더:                                        │
│  {semantic_layer} {domain_glossary} {session_history} │
│  {few_shot_examples} {previous_step_results}         │
│                                                      │
│  [새 버전으로 저장] [이전 버전으로 롤백]               │
│  [테스트 실행 (Golden Dataset)]                       │
└─────────────────────────────────────────────────────┘
```

### 4.5 평가 (/evaluation)

```
┌─────────────────────────────────────────────────────┐
│  Evaluation                           [평가 실행]    │
├─────────────────────────────────────────────────────┤
│                                                      │
│  전체 점수: 94.2%  (어제: 95.0%, -0.8%)             │
│  [점수 추이 차트 (30일)]                              │
│                                                      │
│  카테고리별:                                          │
│  safety        ████████████████████ 100%  ✅         │
│  simple_query  ████████████████████ 96%   ✅         │
│  aggregation   ██████████████████░░ 90%   ✅         │
│  insight       █████████████████░░░ 85%   ⚠️        │
│  edge_case     ████████████████░░░░ 80%   ⚠️        │
│                                                      │
│  실패 케이스:                                         │
│  ┌───────────────────────────────────────────────┐  │
│  │ GD-042: "D7 리텐션이 낮은 앱 찾아줘"           │  │
│  │ 기대: insight → 실제: sql                      │  │
│  │ [상세] [Golden Dataset에서 수정] [무시]         │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  [Golden Dataset 편집] [새 테스트 케이스 추가]        │
└─────────────────────────────────────────────────────┘
```

### 4.6 스케줄 관리 (/schedules)

```
┌─────────────────────────────────────────────────────┐
│  Schedules                            [+ 새 스케줄]  │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ✅ 일일 이상치 리포트                                │
│  에이전트: Research Agent                             │
│  Cron: 매일 09:00                                    │
│  질문: "지난 24시간 주요 앱 이상치 분석"               │
│  채널: #airflux-alerts                               │
│  마지막 실행: 2026-04-02 09:00 (성공)                │
│  [일시 중지] [편집] [즉시 실행] [로그]                │
│                                                      │
│  ✅ 주간 요약                                        │
│  에이전트: Research Agent                             │
│  Cron: 매주 월 10:00                                 │
│  질문: "지난 주 주요 지표 요약"                       │
│  채널: #airflux-weekly                               │
│  다음 실행: 2026-04-07 10:00                         │
│  [일시 중지] [편집] [즉시 실행] [로그]                │
│                                                      │
│  ⏸️ 월간 리포트 (일시 중지)                           │
│  [재개] [편집] [삭제]                                 │
└─────────────────────────────────────────────────────┘
```

## 5. API 엔드포인트 (대시보드 백엔드)

대시보드는 Agent Platform의 API Gateway를 공유:

```
GET    /api/admin/agents              → 에이전트 목록
GET    /api/admin/agents/:name        → 에이전트 상세
PATCH  /api/admin/agents/:name        → 에이전트 설정 변경
POST   /api/admin/agents/:name/enable → 활성화
POST   /api/admin/agents/:name/disable → 비활성화

GET    /api/admin/skills              → 스킬 카탈로그
GET    /api/admin/tools               → 도구 목록

GET    /api/admin/schedules           → 스케줄 목록
POST   /api/admin/schedules           → 스케줄 생성
PATCH  /api/admin/schedules/:id       → 스케줄 수정
POST   /api/admin/schedules/:id/run   → 즉시 실행

GET    /api/admin/prompts/:agent      → 프롬프트 버전 목록
POST   /api/admin/prompts/:agent      → 새 버전 저장
POST   /api/admin/prompts/:agent/rollback → 롤백

GET    /api/admin/eval/scores         → 평가 점수 이력
POST   /api/admin/eval/run            → 평가 즉시 실행
GET    /api/admin/eval/golden-dataset → Golden Dataset
POST   /api/admin/eval/golden-dataset → 테스트 케이스 추가

GET    /api/admin/monitoring/cost     → 비용 데이터
GET    /api/admin/monitoring/metrics  → 지연/에러 메트릭
GET    /api/admin/monitoring/logs     → 요청 로그

GET    /api/admin/feedback            → 피드백 목록
GET    /api/admin/users               → 사용자 + 역할
PATCH  /api/admin/users/:id           → 역할 변경
```

## 6. 설정 변경 흐름

```
관리자가 대시보드에서 에이전트 모델 변경
  ↓
PATCH /api/admin/agents/data-agent { model: "openai/gpt-5.4" }
  ↓
두 가지 경로:
  A) Redis 즉시 오버라이드 (임시, 24시간)
  B) agents.yaml 수정 → git commit → 영구 반영
  ↓
응답: { applied: "immediate", permanent: false, expiresIn: "24h" }
  ↓
대시보드에 표시: "⚡ 임시 변경 (24시간). 영구 적용하려면 [확정]"
  ↓
[확정] 클릭 → agents.yaml 수정 + git push (자동)
```

## 7. 설계 결정 이유

| 결정 | 이유 |
|------|------|
| 웹 대시보드가 메인 관리 도구 | Slack Admin 대비: 시각적, 복잡한 설정 편집 가능, 차트/추이 |
| Next.js + shadcn/ui | AB180 기술 스택 친화, 빠른 개발, SSR |
| API Gateway 공유 | 별도 백엔드 서버 불필요 — 기존 Lambda 활용 |
| 임시/영구 분리 | 긴급 변경은 Redis 즉시, 계획 변경은 git (이력 보존) |
| 프롬프트 온라인 편집 | YAML 직접 수정보다 웹 에디터가 접근성 높음 |
| Golden Dataset 웹 관리 | 테스트 케이스 추가/수정을 비개발자도 가능하게 |
