# Implementation Roadmap

> Phase별 구현 계획. **초반에는 로컬 개발 중심** — 인프라 배포 없이 동작 확인 후 점진적으로 배포.

## Phase 0: Project Setup + Local Foundation (2주)

**목표**: 별도 레포 생성, 로컬에서 에이전트 등록/실행/테스트 가능한 상태

**원칙**: 인프라(SST/Lambda) 배포 없이 로컬에서 모든 것을 시도

- [ ] **별도 레포 생성** (airflux-agent 또는 적절한 이름)
- [ ] scaffold v1에서 필요한 코드 복사 + 구조 재편
- [ ] `npm run dev` → 로컬 서버 (Express 또는 Hono)로 API 테스트 가능하게
- [ ] Agent > Skill > Tool 3계층 구조 세팅
- [ ] `AgentRegistry`, `ToolRegistry`, `SkillRegistry` 코드 + YAML 설정
- [ ] BaseAgent 클래스 + 첫 번째 테스트 에이전트 (echo agent — LLM 없이 동작 확인)
- [ ] `ResponseChannel` 인터페이스 + ConsoleResponseChannel (로컬 디버깅)
- [ ] `settings/` YAML 설정 파일 세팅 (agents.yaml, skills.yaml 등)
- [ ] Vitest 테스트 환경 세팅 + 기본 테스트
- [ ] AI Gateway 연결 테스트 (로컬에서 LLM 호출 확인)

**배포**: 없음. 로컬에서 `npm run dev` → `curl localhost:3000/api/query` 로 확인.

### 로컬 개발 환경

```
npm run dev        → Express/Hono 로컬 서버 (포트 3000)
npm run test       → Vitest 단위 테스트
npm run eval       → Golden Dataset 평가 (실제 LLM 호출)
npm run agent:list → 등록된 에이전트 목록 출력
npm run agent:test → 특정 에이전트에 질문 테스트

# 로컬에서 에이전트 테스트
curl -X POST http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "앱 123의 DAU", "userId": "dev"}'
```

## Phase 1: 에이전트 개발 + 로컬 검증 (3주)

**목표**: 로컬에서 실제 에이전트 동작 확인. 아직 인프라 배포 안 함.

- [ ] 첫 번째 실제 에이전트 (Data Agent — dbt/Snowflake 연동)
- [ ] Router Agent (의도 분류, 로컬에서 테스트)
- [ ] Guardrails (READ-ONLY, 비용, PII)
- [ ] 프롬프트 버전 관리 (prompts/*.yaml)
- [ ] Golden Dataset 구조 확장 + 30개 작성
- [ ] 로컬 REST API로 에이전트 호출 테스트
- [ ] Audit Logger 기본 구현 (console + 파일)
- [ ] PII 사후 마스킹 유틸리티
- [ ] 두 번째 에이전트 시도 (Research Agent 또는 Task Agent)

**배포**: 없음. 로컬에서 `curl` + 테스트로 검증.

## Phase 2: 첫 배포 + Slack 연동 (3주)

**목표**: 처음으로 인프라에 배포. Slack에서 사용자가 실제 사용 시작.

- [ ] SST 설정 + Lambda 배포 (Gateway + Worker)
- [ ] Slack App 설정 + 웹훅 연결
- [ ] SlackResponseChannel 구현 (Block Kit)
- [ ] Orchestrator (StepResult 프로토콜, 다중 에이전트)
- [ ] Redis 세션 (Working Memory)
- [ ] CloudWatch 모니터링 + 알림
- [ ] 피드백 수집 (👍/👎 버튼)

**배포물**: Slack에서 `/airflux 질문` → 실제 응답. CS 팀 시범 사용 시작.

## Phase 3: Research Automation (3주)

**목표**: 장시간 자동 분석 워크플로우

- [ ] DurableAgent 기반 워크플로우 (WDK)
- [ ] 신규 앱 온보딩 분석 자동화
- [ ] 이벤트 드리프트 감지 Cron
- [ ] 데이터 Export (CSV → S3 Presigned URL)
- [ ] Webhook 엔드포인트 (외부 이벤트 트리거)
- [ ] 주간 퍼포먼스 리뷰 자동 생성

**배포물**: 매일 아침 이상치 리포트 자동 전달 + 앱 생성 시 자동 분석

## Phase 4: Platform Expansion (2주)

**목표**: 멀티 플랫폼 + 고급 기능

- [ ] Chat SDK 도입 (Slack adapter → 향후 Teams 등 확장)
- [ ] MCP Server (Claude Code 연동)
- [ ] 대화형 분석 (스레드 컨텍스트, follow-up)
- [ ] RBAC (역할별 데이터 접근 제어)
- [ ] 비용 대시보드 (AI Gateway 비용 추적)
- [ ] A/B 테스트 (모델 비교)

**배포물**: 개발자가 Claude Code에서 Airflux 데이터 직접 접근

## v2 추가 항목 (Agent Management 연구 반영)

### Phase 0에 추가
- [ ] `settings/agents.yaml` 설정 스키마 정의
- [ ] `settings/routing-rules.yaml` 초기 라우팅 규칙
- [ ] `settings/rbac.yaml` 기본 역할 정의

### Phase 0에 추가 (연구 라운드 결과)
- [ ] `settings/agents.yaml` 설정 스키마 정의
- [ ] `settings/routing-rules.yaml` 초기 라우팅 규칙
- [ ] `settings/rbac.yaml` 기본 역할 정의 (admin/analyst/viewer)
- [ ] `settings/rate-limits.yaml` 기본 제한 설정

### Phase 1에 추가
- [ ] `settings/prompts/sql-agent.yaml` 프롬프트 버전 관리
- [ ] Golden Dataset 구조 확장 (category, difficulty, rubric 필드)
- [ ] Audit Logger 구현 (CloudWatch + S3 이중 보관)
- [ ] PII 사후 마스킹 유틸리티 (`maskPiiInResponse()`)
- [ ] App Context 해결 (명시적 → 세션 → 채널매핑 → 질문)
- [ ] `settings/channel-app-mapping.yaml` 작성
- [ ] 한국어 시간 표현 정규화 (`normalizeTimeExpression()`)
- [ ] Data Export 기본 (CSV, Presigned URL)

### Phase 2에 추가
- [ ] Router Agent + routing-rules.yaml + few-shot 연동
- [ ] Orchestrator (StepResult 프로토콜, 조건부 실행, Graceful Degradation)
- [ ] 피드백 수집 시스템 (👍/👎 버튼 + 저장 + negative 분석)
- [ ] Evaluation Cron (매일 golden dataset 자동 평가)
- [ ] Redis 세션 전환 (Working Memory Tier 1)
- [ ] User Memory (Tier 2, 자주 조회 앱 자동 학습)
- [ ] Rate Limiting (Redis Sliding Window + 동시성 세마포어)
- [ ] Notification 시스템 (SlackNotificationChannel)
- [ ] Domain Glossary fuzzy matching (오타 처리)

### Phase 3에 추가
- [ ] Drift Detection (7d vs 30d 비교, 에이전트별/카테고리별)
- [ ] A/B Testing 프레임워크 (experiments.yaml, variant 선택)
- [ ] Few-shot 자동 축적 (positive feedback → 후보 → 수동 검증)
- [ ] 배포 시 자동 회귀 테스트 (CI/CD, safety 실패 시 배포 차단)
- [ ] 앱 노트 (app-notes.yaml, 앱별 도메인 지식 + 자동 필터)
- [ ] Semantic Layer 스키마 동기화 Cron
- [ ] monitors.yaml 알림 규칙 엔진
- [ ] Webhook NotificationChannel
- [ ] 큐잉 (rate limit 초과 시 대기열)

### Phase 4에 추가
- [ ] RBAC 전체 구현 (Slack user group 연동 + 앱별 접근 제어)
- [ ] Prompt injection 방어 강화 (정규식 + 프롬프트 규칙)
- [ ] 비용 대시보드 (AI Gateway 추적 + CloudWatch 쿼리)
- [ ] MCP Server (5 tools + 2 resources, OAuth 2.1)
- [ ] Chat SDK 통합 (ChatSdkResponseChannel, Card JSX)
- [ ] 다중 앱 비교 분석 UX

## 기술 부채 관리

| 항목 | Phase | 설명 |
|------|-------|------|
| Redis 세션 (현재 In-memory) | Phase 2 | Lambda 재시작 시 세션 유실 방지 |
| Evaluation Pipeline | Phase 2 | Golden Query 자동 회귀 테스트 |
| Rate Limiting | Phase 3 | 사용자별/앱별 요청 제한 |
| Audit Log | Phase 1 | 쿼리 실행 이력 기록 (보안 필수) |
| Prompt 버전 YAML 전환 | Phase 1 | 코드 하드코딩 → YAML 버전 관리 |
| Few-shot 관리 UI | Phase 4 | 수동 큐레이션 도구 |
