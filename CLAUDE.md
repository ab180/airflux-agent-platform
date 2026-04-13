# CLAUDE.md — Airflux Agent Platform

> 이 파일은 새 레포의 루트에 배치. Claude Code가 프로젝트를 이해하는 데 사용.
>
> **반드시 함께 읽을 것**: `docs/CONTEXT.md` — 이 프로젝트가 왜 이런 결정을 했는지, 하지 말아야 할 것, 사용자의 원래 비전.

## 프로젝트 개요

AB180의 사내 AI 에이전트 관리 플랫폼. 에이전트를 자유롭게 등록/개선/수정하고, 스킬과 도구를 세팅하고, 자동 실행/모니터링하는 시스템.

**이것은 특정 기능을 하는 봇이 아니라, 에이전트를 관리하는 플랫폼이다.**

## 핵심 구조

```
[시스템] → [Agent] → [LLM Model] → [서빙 채널]

시스템: 에이전트를 등록/관리/모니터링하는 웹 대시보드
Agent: 프롬프트 + Skill + Tool + 스케줄을 가진 AI 개체
LLM Model: 벤더(Anthropic/OpenAI) > 모델(claude-sonnet/gpt-5.4)
서빙 채널: 웹앱(기본), Slack, Email, MCP 등 확장 가능
```

### Agent > Skill > Tool 3계층

```
Agent (에이전트) = LLM + Instructions + Skills + Tools
  ├── Skill (스킬) = 하나 이상의 도구를 조합한 고수준 능력
  │   └── Tool (도구) = 외부 시스템과 상호작용하는 단일 함수
  └── 설정: agents.yaml (모델, 스킬, 스케줄, 비용 한도)
```

### 두 종류의 사용자

- **관리자 (Admin)**: 웹 대시보드에서 에이전트 등록/수정, 스킬 세팅, 프롬프트 튜닝, 모니터링
- **일반 사용자 (User)**: 자연어로 에이전트 사용 (웹 채팅, Slack, API 등)

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 모노레포 | Turborepo |
| 서버 | Hono (로컬 + Lambda 호환) |
| 대시보드 | Next.js App Router + shadcn/ui |
| LLM (로컬) | Claude Code 크레덴셜 (~/.claude/.credentials.json) |
| LLM (인프라) | AWS Bedrock 또는 내부 Agent API |
| Agent Framework | AI SDK 6 Agent class |
| 데이터 | Snowflake, MySQL, Redis (Upstash) |
| 파일 | S3 + Presigned URL |
| 테스트 | Vitest |

## LLM Provider 전략

```
로컬: Claude Code 크레덴셜 자동 읽기 → 본인 구독 크레딧, API 키 비용 없음
인프라: AWS Bedrock (IAM) 또는 agent.internal.airbridge.io

환경 자동 감지:
  Lambda → Bedrock
  AGENT_API_URL 설정됨 → Internal Agent API
  그 외 (로컬) → Claude Code 크레덴셜
```

## 설계문서

`docs/design/` 디렉토리에 43파일, ~10,000줄의 상세 설계문서가 있음.

### 읽는 순서 (구현 시 참조)

1. `architecture/00-vision.md` — 프로젝트 비전
2. `architecture/15-skill-tool-system.md` — Agent/Skill/Tool 3계층
3. `architecture/18-llm-provider.md` — LLM Provider 전략
4. `architecture/05-agent-management.md` — 에이전트 관리/운용
5. `architecture/19-orchestrator-detail.md` — Orchestrator 실행 모델
6. `architecture/20-scheduler.md` — 스케줄러
7. `architecture/16-admin-interface.md` — 웹 대시보드
8. `reference/03-config-schemas.md` — YAML 설정 스키마 (15종)
9. `implementation/03-roadmap.md` — Phase별 계획

### 카테고리

- `architecture/` (20개) — 시스템, 에이전트, Orchestrator, Provider, 스케줄러, 보안 등
- `capabilities/` (11개) — SQL, 인사이트, 이미지, 자동화, 평가, 한국어 NLU 등
- `implementation/` (6개) — 로드맵, 온보딩, 테스트, 운영 Runbook
- `reference/` (4개) — 에러코드, 기술결정, 설정스키마, 비용가이드

## 개발 원칙

### Phase 0-1: 로컬 개발 중심

- 인프라(SST/Lambda) 배포 없이 로컬에서 모든 것을 시도
- `npm run dev` → 로컬 서버 (Hono, localhost:3000)
- `curl localhost:3000/api/query` 로 에이전트 테스트
- LLM은 로컬 Claude Code 크레덴셜 사용

### 코드 + 설정 하이브리드

- 에이전트/도구: 코드로 추가 (외부 라이브러리, 복잡한 로직)
- 운용 파라미터: YAML 설정으로 제어 (모델, 스킬, 스케줄, 비용 한도)
- 프롬프트: YAML 버전 관리 (배포 없이 변경, 즉시 롤백)

### 설정 파일 (settings/)

15종 YAML: agents, skills, routing-rules, semantic-layer, domain-glossary, feature-flags, rbac, experiments, monitors, cron-reports, rate-limits, channel-app-mapping, app-access, prompts/*, few-shots/*

## 현재 구현 상태 (Phase 0 완료 + Phase 1 진입)

> 상세: `docs/STATUS.md`

```
packages/core      — Agent/Skill/Tool/Guardrails/Router 프레임워크 (35 tests)
packages/server    — Hono API + SQLite + 30+ endpoints (49 tests)
apps/dashboard     — Next.js 16 대시보드 (17 routes)
settings/          — YAML (agents, skills, feature-flags, routing-rules)
```

- 에이전트 2개: echo-agent, assistant-agent (AI SDK 6)
- 도구 6개: echo, getTimestamp, calculate, formatJson, httpGet, getSystemInfo
- 대시보드 17개 페이지: 현황, 에이전트(목록+상세), 스킬, 도구(테스트), 프롬프트, 플레이그라운드, 평가, 스케줄, 피드백, 모니터링, 로그
- SQLite 6개 테이블: request_logs, feedback, prompt_versions, sessions, golden_dataset, eval_runs
- Guardrails 5종: pii-filter, read-only, prompt-injection, row-limit, query-length
- Router: 키워드 + 정규식 기반 에이전트 자동 선택
- 보안: 입력 검증, CORS, 보안 헤더, admin 인증, SSRF 방어, 코드 인젝션 방어, guardrails
- 테스트 84개, 빌드 + 서버 + API 전체 동작 검증 완료

## Git Workflow

- git 작업은 사용자가 명시적으로 요청할 때만 수행
- 커밋/푸시를 자동으로 하지 않음

## 참고: Montgomery (원본)

이 프로젝트는 AB180의 Slack 봇 'abot' (코드명 Montgomery)에서 영감을 받아 시작됨.
Montgomery에서 43개 아키텍처 패턴을 학습하여 설계에 반영.
상세: `docs/design/implementation/02-montgomery-patterns.md`
