# airops — 팀 협업 에이전트 플랫폼 비전 & 설계

**Date**: 2026-04-23
**Status**: Design exploration — Phase A 일부 shipped (airops CLI, PR #11)
**Scope**: 전략 포지셔닝 + Phase A-C 로드맵 + 5각도 심층 조사 + 34 reflection rounds

## Context

사용자의 **Airflux Agent Platform** 포지셔닝 결정.
- 기존 프레이밍: "AB180 사내 에이전트 관리 플랫폼"
- 업데이트된 프레이밍 v1: **"범용 오픈소스 에이전트 하네스"** — personal-first, organization-compatible
- **업데이트된 프레이밍 v2 (FINAL)**: **"팀이 공동 운영하는 에이전트 협업 플랫폼"** — 코드-퍼스트 OSS. 개인 사용은 온보딩 훅, **팀 협업이 본 카테고리**.
- 도메인 특화(Airbridge/Airflux/한국어 NLU/Snowflake)는 **별도 스킬셋으로 분리**, core는 범용

### v2 비전 디테일 (사용자 확인 사항)

1. **"프로젝트"는 타입 선택형 경계**
   - 코드 관리용 (GitHub 레포와 유사 — Git 바인딩 옵션)
   - 문서 작업용 (Notion 공간과 유사)
   - 목표/프로젝트 기반 (Jira/Linear 프로젝트와 유사)
   - 동일 플랫폼 안에서 타입 선택. 공통 core는 **리소스 집합 + 권한 경계**.

2. **상태 관리 통합**
   - Jira/Linear/GitHub Issues 커넥터로 외부 상태 연결
   - 또는 이 플랫폼 자체가 팀 상태관리 도구가 됨 (선택적 대체)
   - 에이전트가 이슈 읽고/쓰고/상태 전이 가능 → 에이전트 = 팀 멤버

3. **자산 스테이트 머신 (개인 ↔ 팀)**
   - 개인 drawer에서 에이전트 제작/테스트 (자유)
   - 충분히 검증되면 팀 프로젝트로 **promote** (Git fork→upstream PR과 유사한 리뷰 흐름)
   - 팀 자산은 권한 모델 따름

4. **역할 분리 (매우 중요)**
   - GitHub 수준의 세밀함 (owner/maintainer/collaborator/viewer)
   - 리소스별 ACL 가능 (agent/skill/tool/prompt/log 각각)
   - **실행자 vs 편집자 분리** 필수 (컴플라이언스)

### 핵심 미결정: 하네스의 "깊이(depth)"

| 옵션 | 범위 | 현 위치 |
|---|---|---|
| **A. Thin** | 런타임 + 툴 루프 + 메모리 + 기본 UI (Claude Code 스타일) | – |
| **B. Mid** | 코어 + 관측/eval/플레이그라운드 (Mastra + Langfuse 스타일) | – |
| **C. Fat** | 코어 + 관측 + 관리자 대시보드 + 라우터 + 가드레일 + 스케줄러 | ← 현재 코드베이스 |

현재 구현은 C. 이 선택이 OSS 포지셔닝에서 **opinionated full-stack harness**(Next.js for React) 의 포지션인지, 과잉 범위인지 결정해야 함.

## Method

사용자 지시: **C+D 조합**
- **D. 5각도 병렬 심층 조사 1회** — general-purpose 에이전트 병렬
- **C. 20~30회 반복 토론/반론 축적** — 현 세션 순차 실행, 이 파일에 누적

## 5 Angles

1. **기술/아키텍처** — 경쟁 하네스의 실제 API surface, 레이어 경계
2. **시장/카테고리** — 2025~2026 에이전트 플랫폼 시장 맵, 카테고리 검증
3. **OSS 거버넌스/수익** — 라이선스, core/cloud 분리, 수익화 경로
4. **DX / 개발자 채택** — 첫 5분 경험, 임베드 vs 스탠드얼론, 채택 마찰
5. **AB180 적합도** — 현 코드베이스의 core/reference 분리 가능성

---

## Phase 1 — 병렬 조사 결과

### Angle 1: 기술/아키텍처

**핵심 통찰 — Thin/Mid/Fat 이분법 버려라**
> 답은 "fat internally, thin publishable core". 현 코드베이스를 **core에 얹힌 distribution**으로 리팩토. 이러면 thin/mid/fat 선택 자체가 사라짐.

**프로젝트별 레이어 매트릭스** (O=owned, —=delegated)

| 프로젝트 | Runtime | ToolLoop | Mem | UI | Obs | Orch | Sched | Eval | Route | Guard | RBAC | 플러그인 | 실행 형태 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **AI SDK Agent** | O | O | — | — | — | — | — | — | — | — | — | code | library |
| **Mastra** | O | O | O | dev-only | O | O | — | O | — | 부분 | — | code | lib+devserver |
| **Inngest AK** | O | O | — | — | O(Inngest) | O | O(Inngest) | — | O | — | — | code | lib+Inngest |
| **CrewAI** | O | O | O | enterprise | 부분 | O | — | 부분 | — | — | — | code+yaml | library |
| **opencode** | O | O | session | TUI | local | — | — | — | O(model) | — | — | code+json | CLI |
| **Letta** | O | O | **O(core)** | O(ADE) | 부분 | 부분 | — | — | — | 부분 | 경량 | code+API | **server** |
| **OpenHands** | O | O | O | O | O | O | — | O | — | sandbox | 경량 | md+code | server+UI+CLI |
| **Dify** | O | O | O | **O(builder)** | O | O | O | O | O | O | O | **UI+manifest** | platform |
| **Airflux(현재)** | O | O | 부분 | O | O | O | O | O | O | O | 부분 | code+YAML | platform |

**경계 분석**
- **AI SDK**: 한 턴 루프만 (stopWhen/prepareStep). "하네스 = 너의 Next.js route" 철학.
- **Mastra**: primitives + 로컬 플레이그라운드. 배포/auth/routing은 너가 소유.
- **Inngest AK**: multi-agent 그래프 + durable steps. Durability가 제품의 핵심.
- **Letta**: "agent는 우리 서버에 산다". DB-as-source-of-truth. Airflux ambition 과 모양이 가장 비슷.
- **Dify**: **경고 신호** — UI가 source of truth 되면 code가 짐. Airflux C-레벨이 이쪽으로 drift 중.
- **opencode**: "한 명의 개발자 노트북"에서 끝. 설계상 다유저/RBAC 없음.

**가장 가까운 경계: Letta + Mastra 하이브리드**
- Letta의 "server-of-record" 모양 ← Airflux 대시보드-중심 비전과 매칭 (SQLite 테이블들이 이미 이 방향)
- Mastra의 "code-first primitives + dev playground" ← core API shape 복사
- **YAML은 코드의 projection**이어야 함 (reverse X)
- Dify는 타겟 아님, warning임

**훔쳐야 할 아이디어 5개**
1. **Inngest `NetworkState` + Router** — 현재 keyword/regex router를 typed/durable/inspectable `NetworkState`를 받는 Router 함수로 업그레이드. `packages/core`에 1:1 매핑.
2. **OpenHands microagents (markdown-as-skill)** — Skill은 frontmatter 달린 마크다운 (triggers/tools/prompt). YAML prompts/ + skills/ 중복 붕괴. Anthropic Skills 형태와 정합.
3. **Letta memory blocks** — explicit, editable, size-bounded 메모리 단위. 대시보드가 렌더/편집할 의미있는 대상 제공.
4. **AI SDK `stopWhen` / `prepareStep`** — 가장 깨끗한 툴-루프 제어. `@airops/core`에서 이 훅 그대로 노출.
5. **Mastra MCP 패리티** — 모든 내부 툴을 MCP 서버로도 배포 → Claude Desktop/opencode에서도 소비 가능.

**제안 패키지 토폴로지** (3-tier)
```ts
// @airops/core — 순수 primitives, I/O 없음, 서버 없음
const agent = defineAgent({
  id: "sql-agent",
  model,                          // AI SDK ModelProvider
  instructions,
  skills: [sqlSkill],             // Skill = { triggers, tools, prompt }
  memory,                         // interface: load/save/search
  guardrails: [piiFilter, readOnly],
  stopWhen, prepareStep,          // AI SDK primitives
});
const run = await agent.run(input, { state, signal });
```
- **`@airops/core`** — Agent/Skill/Tool/Guardrails/Router primitives, `run()`, NetworkState, memory interface. **DB 없음.**
- **`@airops/runtime`** — 기본 persistence (SQLite/Postgres), 스케줄러, observability sinks. **Swappable.**
- **`@airops/dashboard`** — **reference UI**, runtime REST API 위. Optional, deletable.

→ 3개 패키지 경계가 깨끗하면 현재 "fat" 빌드는 **distribution**이 됨. 제품 = **core** (thin). 배포물 = **fat** (AB180 내부용).

**Verdict**: `fat internally, thin publishable core`. Letta 형 server-of-record + Mastra 형 SDK 이음매 + OpenHands 형 markdown skills.

### Angle 2: 시장/카테고리
_(에이전트 웹 접근 없음 → 2026-01 cutoff 지식 기반 가설. 후속 검증 필요.)_

**카테고리 택사노미 (9종)**
1. Agent Frameworks (library) — LangChain, LlamaIndex, Haystack
2. Agent Harnesses/Runtimes (opinionated SDK) — Mastra, Inngest Agent Kit, Vercel AI SDK Agent, PydanticAI, smolagents, OpenAI Agents SDK
3. Low/No-code Platforms — Dify, Flowise, Langflow, n8n-AI, Rivet
4. Observability — Langfuse, Helicone, Arize, LangSmith, Braintrust
5. Gateways/Routers — LiteLLM, Portkey, OpenRouter
6. Orchestrators (multi-agent) — CrewAI, AutoGen, LangGraph
7. Vertical Agent Products — OpenHands, Devin, Lindy, Sierra, Harvey
8. Infra Primitives — E2B, Daytona, Browserbase, Mem0, Zep
9. MCP Ecosystem — Anthropic MCP, Cline, Continue

**핵심 시그널**
- "agent framework" — 포화, 스켑틱 높음. **이 단어 쓰지 마라.**
- "workflow builder" — 비개발자 세그먼트로 이동, 개발자는 이탈
- "agent harness" — 2025 부상, 아직 주인 없는 명사
- "agent platform" — 범용/vague, enterprise vaporware 뉘앙스

**펀딩 시그널**
- a16z: 에이전트 인프라 스택 (런타임/메모리/브라우저/eval/게이트웨이) 층별 투자
- Sequoia: "SaaS is dead" — vertical agent + workflow lock-in 선호, 프레임워크 비선호
- Series A+: LangChain, CrewAI, E2B, Browserbase, Langfuse, Portkey, Decagon, Sierra, Cognition, Mastra 모회사
- **순수 "framework"에는 베팅 줄어듦**, managed runtime + vertical에 집중

**2x2 포지셔닝 결론**
- 축: `Self-hosted/OSS ↔ SaaS` × `Thin-SDK ↔ Fat-platform`
- **OSS + Fat** 사분면: Dify, Langflow, Flowise — 모두 **no-code/visual**
- **코드-퍼스트 OSS fat harness**은 비어있음. ← Airflux의 타겟 좌표

**화이트 스페이스 (4종)**
1. **코드-퍼스트 OSS fat harness** (개발자용, 대시보드+eval+프롬프트+스케줄러 원레포)
2. **로컬-퍼스트 크레덴셜** (Claude Code 구독 사용, 아무도 진지하게 안 함)
3. **Personal→Org 연속성** (Mastra 근접, but SaaS-gated)
4. **YAML 프롬프트 버전관리 + feature flags + RBAC** 를 first-class OSS primitive로

**Verdict**
> "Agent harness" 명사에 깃발 꽂되, 포지셔닝 문구 샤프하게:
> **"The open-source agent platform for teams — code-first, local-first, fullstack."**
> LangChain(framework)도 Dify(no-code)도 건들지 말 것. "harness" 카테고리를 **개발자-중심, opinionated, fullstack OSS** 로 정의.

**리스크**: Mastra가 OSS-fat 쪽으로 확장하면 12개월 안에 gap 닫힘 → **속도 중요**.

### Angle 3: OSS 거버넌스/수익

**피어 매트릭스 요약**
| 프로젝트 | 라이선스 | 수익 모델 | 리벤뉴 시그널 |
|---|---|---|---|
| LangChain | MIT | LangSmith(SaaS) + Enterprise | 강함 (~$20M ARR) |
| **Mastra** | Elastic License 2.0 (**not OSI**) | Cloud-first | 초기, seed |
| Dify | Apache 2.0 + commercial clause | Cloud + Enterprise | 강함 (APAC) |
| **Langfuse** | MIT core + `ee/` 상용 | Open-core + SaaS | 건전 성장, YC |
| Letta | Apache 2.0 | Cloud | 초기, 연구자 |
| Haystack | Apache 2.0 | deepset Enterprise 플랫폼 (별도) | B2B 수익 |
| Inngest | Dual (SDK Apache / Server AGPL-ish) | Cloud-only | 성장중 |
| Vercel AI SDK | Apache 2.0 | Vercel 호스팅 유입 | 간접 |

**컨트리뷰터 인센티브 — 패턴**
- 성공: 좁은 surface + 빠른 머지 + 공개 로드맵 + 크레딧 (LangChain, Langfuse, Haystack)
- 실패: 무거운 CLA + 느린 트리아지, Cloud feature가 OSS와 invisible하게 갈라짐

**리라이선싱 리스크 (Elastic/Redis/HashiCorp)**
- 발생 조건: (a) 하이퍼스케일러 리셀, (b) VC moat 압박, (c) 단일 회사 >90% 커밋
- Airflux는 (b),(c) 해당, (a) 없음 → **Day 1부터 후회 안 할 라이선스 고르는 게 핵심**

**Airflux 권장안 (구체적)**
- **License**: **Apache 2.0** (patent grant, trademark reservation, 업계 표준)
- **저작권자**: `AB180, Inc.` 파일 헤더 (개인 저작권 X)
- **Trademark**: "Airflux" AB180 상표로 reserve, `TRADEMARK.md` 명시
- **CLA**: **DCO (sign-off)만**, CLA는 enterprise 딜 생길 때 고려
- **Governance**: Corporate-led BDFL-lite, `docs/rfcs/` 퍼블릭, AB180 메인테이너 머지
- **미래 open-core 옵션**: `packages/enterprise/` 디렉토리 Day 1부터 경계 확보 (SSO, RBAC, audit, multi-tenant, managed scheduler)
- **수익 경로 (12-18개월 후)**: Airflux Cloud + Enterprise. 지금은 공개 커밋 X.

**피트폴 (중요)**
1. BSL/ELv2로 시작 금지 (Mastra 실수)
2. Day 1 CLA 금지 (DCO 충분)
3. 라이선스 헤더 믹스 금지
4. 상표 정책 지금 정하기 (retroactive는 적대적으로 보임)
5. enterprise 경계 커밋 #1부터 (open-core 레트로핏은 지옥 — GitLab)
6. "source-available 연극" 금지 (OSI or honest proprietary, 둘 중 하나)
7. **AB180 내부 사용 ≠ 커뮤니티 채택** — DevRel 시간 예산 없으면 내부용으로 남음 인정

**TL;DR**: Apache 2.0 + AB180 저작권 + DCO + 상표 reserve + 선택적 `packages/enterprise/`. **Langfuse/Haystack 경로**, not Mastra/Elastic.

### Angle 4: DX / 개발자 채택

**프레임워크별 5분 경험 비교 (요약)**

| 프레임워크 | 첫 명령 수 | Hello-world LOC | Playground | Obs OOTB | Embed |
|---|---|---|---|---|---|
| **Mastra** | 2 | ~15 | 브라우저 `:4111` | 트레이스+eval | Hono routes |
| Inngest AK | 3-4 | ~20 | Inngest Dev Server | 단계별 트레이스 | 라이브러리 |
| **Vercel AI SDK** | 1 | 5-8 | — | console.log | trivial Next |
| Dify | 1 + 10 clicks | 0 (UI) | UI 자체 | 풀 로그 | iframe/API |
| Letta | 2 | ~10 | ADE | 메모리 diff | Python 서버 |
| CrewAI | 3 | ~30 (yaml+py) | — | 장황 stdout | Python 전용 |
| opencode | 2 | 0 (TUI) | 터미널 | 인라인 | embed X |

**패턴 인사이트**
- 칭찬 포인트: Mastra "playground 열렸어", Vercel "5줄 작동", Letta "memory 보여"
- 불만 포인트: CrewAI YAML+Python 분열, Inngest AK 선행 지식, Dify "magic broke", Mastra playground→deploy 갭, Letta Python-only
- **Churn 4대 원인**:
  1. State/memory ("어떻게 영속화?") — 이게 제일 많이 죽임
  2. Deploy (로컬 DX 좋지만 prod 손 놓는 프레임워크들)
  3. Observability cliff (console.log → 유료 Langfuse 중간 없음)
  4. "Magic" 고장 (silent routing 실패)
- **Embed vs Standalone**: JS 생태계는 embed-선호 우세 (Vercel AI SDK, Mastra Next integration). Standalone은 제품 UI = Dify/opencode/Letta.
- **Dashboard 기대**: 솔로개발자/첫체험 → 환영 (Mastra playground, Letta ADE). 플랫폼팀 → bloat 본다, bring-your-own obs 원함. **승리 패턴 = "배송되지만 옵션, 로컬 실행"** (Mastra)

**Airflux 제안 5분 경로**
```
1. npx create-airflux@latest my-agent
2. cd my-agent && npm run dev    # Hono + 대시보드 on :3000
3. localhost:3000/playground 자동 오픈
4. pre-seeded echo-agent 응답 → 트레이스 옆 라이브
5. settings/agents.yaml 편집 → 핫리로드
```
Step별 체험 디테일:
- Step 1: "Using your Claude Code credentials — $0 to try" **(유니크 훅)**
- Step 3: split view (chat | 라이브 trace/tool-calls | 프롬프트 YAML)
- Step 4: 인라인 "cost: $0.00 (local credential)" 배지 → #1 trial friction 제거
- Step 5: YAML 핫리로드 → "personal-first" 약속 입증

**피해야 할 3대 실수**
1. **첫 5분 안에 클라우드 가입/API 키 요구 금지** — Claude Code 크레덴셜이 Airflux의 unfair advantage
2. **hello-world 전에 config 4개 파일로 분열 금지** (CrewAI 안티패턴). 한 에이전트 = 한 YAML entry
3. **Observability를 별도 제품으로 분리 금지** — 트레이스/비용/프롬프트 diff 같은 대시보드에. dev가 Langfuse 손대는 순간 "personal-first" 스토리 붕괴

**Fat harness + dashboard 판정**: **net help** (로컬-퍼스트, 옵션인 경우). Mastra playground = 2025 최강 채택 가속기. Letta ADE = 유지 해자. 실패 모드: hosted-only 대시보드 (lock-in 지각), 또는 dashboard가 code를 대체 (Dify 천장). Airflux 현재 모양 (로컬 Next.js 대시보드가 같은 YAML/SQLite 읽음) = **승리 패턴과 일치**. 유지, 로컬, `--no-dashboard` 플래그로 skippable.

### Angle 5: AB180 코드베이스 core/reference 분리 가능성

**Splittability: 85% TODAY. 2일 리팩토로 깨끗한 분리 가능.**

**Domain bleed 맵 (정확한 위치)**

| 위치 | 커플링 | 이슈 |
|---|---|---|
| types/agent.ts | 주석 only | L77-78, L133: `ab180/agent` 문자열 (비영향) |
| guardrails/built-in.ts | **MODERATE** | 한국어 PII 패턴 (주민등록번호, 전화번호) 하드코딩 — 범용이나 한국 특화 디폴트 |
| **bootstrap.ts** | **HIGH** | L217-400+: `queryData`, `generateChartData`, `renderChart`, domain-glossary 도구들이 Snowflake+Airflux 테이블 가정 |
| **settings/semantic-layer.yaml** | **HIGH** | L4-5: `database: snowflake`, `schema: airflux_prod` |
| **settings/domain-glossary.yaml** | **HIGH** | 한국어 비즈니스 용어 (DAU/MAU/LTV/리텐션) |
| **settings/agents.yaml** | **HIGH** | AB180 특화 에이전트 (chief/ops/data-query/code-search) |
| admin.ts | Generic | 전부 플랫폼-agnostic ✓ |
| routes/query.ts | 주석만 | 로직 generic ✓ |

**Core 강점 — 이미 plugin 시스템 있음**
```ts
registries/agent-registry.ts  → registerFactory + setDefaultFactory
registries/tool-registry.ts   → register
registries/skill-registry.ts  → register
guardrails/runner.ts          → registerGuardrail
routing/router.ts             → LLMRouter callback
```
→ BaseAgent 인터페이스 기반, 단일 LLM SDK 하드 의존 없음 (lazy import)

**Dashboard**: 17개 페이지 전부 플랫폼-agnostic ✓ (agents, playground, monitoring, feedback)

**SQLite**: conversation_store, feedback_store, log_store — 모두 generic 스키마 ✓

**environment.ts**: 클린 추상화, 도메인 leak 없음 ✓

**권장 레포 토폴로지**
```
Public OSS:
  airflux/airflux
    packages/core/      ← types, registries, abstractions
    packages/server/    ← Hono routes, generic tools, SQLite
    apps/dashboard/     ← Next.js (전부 generic)
    docs/design/

Internal AB180:
  ab180/airflux-reference (private)
    packages/tools/     ← @airops-ab180/tools (Snowflake 도구들)
    packages/settings/  ← semantic-layer, domain-glossary, AB180 agents
    apps/ab180-dashboard/ (필요 시)
```

**통합 레이어 (예시)**
```ts
import { AgentRegistry, ToolRegistry } from '@airops/core';
import { registerAB180Tools } from '@airops-ab180/tools';
import { loadAB180Config } from '@airops-ab180/settings';

await registerAB180Tools();
const config = loadAB180Config();
await AgentRegistry.initialize(config.agents);
```

**정확한 bleed fix 리스트 (~2일)**

| 파일 | 라인 | 액션 |
|---|---|---|
| bootstrap.ts | 217-400 | `@airops-ab180/tools`로 추출, 선택적 등록 export |
| bootstrap.ts | 36 | env fallback: `AIRFLUX_SETTINGS_DIR` |
| settings/semantic-layer.yaml | all | AB180 fork로 이동 |
| settings/domain-glossary.yaml | all | AB180 fork로 이동 |
| settings/agents.yaml | 1-50 | `settings/ab180/agents.yaml`, OSS에는 예시 config로 배포 |

**공개 API breaking change 없음.**

---

## Phase 2 — Reflection Rounds (반복 토론 축적)

각 라운드는 새로운 각도/반론/프레이밍/실험 생각을 추가. 이전 라운드들과 대화.

### Round 1 — 5 에이전트 합의점 (Consensus Lock)

5각도가 독립적으로 같은 방향을 가리킴:

1. **Fat/Thin 이분법은 가짜 질문.** 답은 "fat internally, thin publishable core" = 3-tier 패키지 (@airops/core + /runtime + /dashboard). Agent 1이 아키텍처 관점, Agent 5가 코드베이스 관점에서 같은 결론.
2. **카테고리 = "agent harness"**, 코드-퍼스트 OSS fat harness 사분면이 비어 있음 (Agent 2). 현재 코드베이스 모양이 이 사분면에 정확히 착륙할 준비됨 (Agent 5).
3. **로컬-퍼스트 + Claude Code 크레덴셜**이 아무도 안 하는 유니크 훅. DX 차별화 (Agent 4) + 시장 white space (Agent 2) 양쪽에서 증명.
4. **Apache 2.0 + DCO + `packages/enterprise/` 경계**가 현 시점 최적 (Agent 3).
5. **~2일 리팩토**로 OSS-분리 가능, 공개 API breaking change 없음 (Agent 5).

→ 이 5개가 동시에 성립. 개별 포지션 합쳐서 하나의 전략이 됨.

### Round 2 — 에이전트들 사이의 긴장/모순

- **Agent 2 vs Agent 4 속도 갭**: Agent 2는 "Mastra가 12개월 안에 OSS-fat 쪽 확장하면 gap 닫힘 → 속도 중요" / Agent 4는 "DX 디테일 (playground, 크레덴셜 훅, 핫리로드, $0 배지) 중요 → 디테일 시간 필요". 속도 vs 폴리시 트레이드.
- **Agent 1 vs Agent 3 opinionated 수준**: Agent 1 "opinionated fullstack (Next.js for agents)" 밀자 / Agent 3 "Apache 2.0 순수, enterprise 디렉토리로 옵션 분리" — 강한 의견 + 열린 라이선스의 긴장.
- **Agent 4 vs Agent 3 Dashboard 위치**: Agent 4는 "로컬 대시보드 = net help, 승리 패턴" / Agent 3의 open-core 모델에서 enterprise 기능 (SSO/RBAC) 분리 → "어디까지 OSS 대시보드에 넣나?" 회색지대.
- **Agent 5 현실주의 vs Agent 2 타이밍**: 2일이면 분리되지만, 2일 후에 바로 OSS 공개할 준비 되어있나? README, 데모, 문서, `create-airflux` 템플릿, 라이선스/상표 작업 = 추가 2주 최소.

### Round 3 — Devil's Advocate: 이 방향이 틀릴 수 있는 이유들

1. **"OSS로 공개하면 채택된다"는 착각** — 지금 GitHub에 하네스 프레임워크가 너무 많음. 공개해도 묻힐 가능성 실제로 큼. Mastra는 YC + 퍼블리싱 머신이 붙어 있음. AB180은 아님.
2. **"fat internally, thin core"는 아름답지만 실제 maintenance 비용이 2배** — core/runtime/dashboard 3개를 따로 버전 관리/릴리즈. 소규모 팀에는 부담.
3. **"Claude Code 크레덴셜"이 앤트로픽 TOS 위반 가능성** — 다른 사람에게 자기 구독 credential 재사용하게 프레임워크가 제공하는 건 회색. 개인용이면 OK, 조직 배포는 애매.
4. **한국어/Airbridge 도메인을 "reference 구현"으로 분리해도, 결국 OSS 코어에 kor-NLU/semantic-layer 개념 추상화가 필요** — 완전히 중립 불가, 완전히 domain-specific도 불가 사이 회색.
5. **"agent harness" 카테고리 명사가 2026년에도 살아남을지 불확실** — 방금 뜨기 시작했기 때문에, 6개월 후 다른 이름(agent runtime? agent shell? agent OS?)으로 합쳐질 수 있음.

### Round 4 — "왜 Mastra에 컨트리뷰트 안 하고 새로 만드나" 질문

이건 실제로 올 비판. 정당한 답변 탄환:

- **Mastra는 ELv2 (OSI 아님)** — Apache 2.0 프로젝트로서 Mastra와 라이선스 호환 불가. 코어 영향권 있는 PR은 넣기 어려움.
- **Cloud-first 회사** — 무언가가 그들 비즈니스 모델에 반하면 (예: 완전 self-host enterprise 기능) reject 가능성.
- **관리자 대시보드 철학 차이** — Mastra playground는 dev 도구. Airflux는 "조직 운영 페이스". 페르소나가 다름.
- **로컬 크레덴셜 철학** — Claude Code 크레덴셜 읽기 같은 건 Mastra에 맞지 않음 (그들은 Cloud로 끌고 가는 게 목표).
- **한국어/아시아 사용자** — Mastra는 영어권 중심. 한국어 NLU/문서는 자연스러운 지역화 포지션.

하지만 정직하게: 이 다섯 이유가 Hacker News에서 설득될지는 별개. "왜 컨트리뷰트 대신 fork?"는 항상 회의론을 받음. 대답 준비 필요.

### Round 5 — 12개월 위협 지형

내년 4월까지 실제로 올 수 있는 killer moves:

1. **Mastra OSS 풀 공개 + Cloud 기능 OSS로 역수출** → "fat OSS" 사분면 직접 침범. 가장 큰 위협.
2. **Vercel AI SDK가 Agent Builder 출시** (Vercel Agent은 이미 있음) → Next.js와 통합된 하네스로 Airflux의 "create-airflux" 모방.
3. **Anthropic이 Claude Agent SDK로 풀스택 제공** — Skills + Files + Memory + Schedule 다 묶어서 Anthropic 클라우드에서 호스팅 → "Claude가 자기 하네스를 제공"이 최강 경쟁.
4. **Dify가 코드-퍼스트 SDK 출시** (역방향) — UI를 탈출구로 안 쓰려는 dev를 위한 코드 레이어. Dify 규모로 하면 빠르게 흡수.
5. **Langchain/Langgraph Studio가 OSS 풀스택 선언** — LangSmith/LangGraph Platform 기능 일부 OSS화.

대응 가능성 순위: 1,2는 진짜. 3은 Anthropic이 서비스로 갈 가능성 있음. 4,5는 덜 likely.

**도출된 방어 원칙**: "AB180만이 할 수 있는 것"을 코어에 심어야 함 — 즉, **한국 시장 + 내부 운영 경험 + MMP 도메인**. 완전 generic 하네스만으로는 2,3에 질 가능성 높음.

### Round 6 — 지금 drift 중인 안티패턴 (자기비판)

현재 코드베이스를 살짝 다르게 보면 이미 Dify 방향으로 drift 중일 수 있는 신호들:

- **17개 대시보드 페이지**는 일부 "UI가 진실의 원천"이 되어가는 경향 있음. YAML 핫리로드가 살아있나? 파일 시스템이 여전히 진실인가?
- **30+ endpoints**가 "대시보드 전용"이면 SDK 유저 관점에서 잉여. `@airops/core` 소비자는 대시보드 없어도 작동해야 함 → 라우트들 중 최소한이 server-side SDK로 expose 되어야.
- **SQLite 6 테이블 (request_logs, feedback, prompt_versions, sessions, golden_dataset, eval_runs)** 중 일부는 "플랫폼 기능" vs "관측성 스토어" 경계에 걸침. core의 일부인가, runtime 책임인가?
- **Guardrails 5종** 중 `prompt-injection`, `pii-filter`는 core. `row-limit`, `query-length`는 SQL 특화 → skills/tools 레벨이지 core 레벨 아님.
- **Router**가 keyword+regex 기반인데, Agent 1이 지적한 Inngest-style NetworkState 업그레이드는 core API의 shape 자체를 바꿈 — 지금 리팩토 전에 해야 드라마 적음.

**도출**: 2일 분리 리팩토 전에, core API shape 결정 (NetworkState 도입 여부)을 먼저 해야 함. 그게 공개 API 결정이라 번복 어려움.

### Round 7 — 네이밍 문제 (Airflux 브랜드는 AB180 자산)

"Airflux"는 AB180의 내부 프로젝트명이자 브랜드. OSS 공개하면 문제 여러 개:

- **상표권 혼동** — Airflux 라는 이름 자체가 AB180 product의 하위 브랜드로 쓰이고 있거나 쓸 수 있음. OSS가 상표권 모호하게 공유하면 나중에 리네이밍 강제 (Elastic→OpenSearch 상황).
- **개인 채택 저항** — "AB180이 만든 내부 도구를 오픈소스로 푼 것"처럼 보이면 개인 dev 채택 꺼림. LangChain은 회사 이름, Mastra는 독립 제품명. 차이 있음.

**3가지 선택지**:
1. **새 이름 (예: Harness, Loom, Forge, Cassette, Stagecraft)** 지어서 OSS 코어에 적용, Airflux는 AB180 인스턴스 이름으로 유지.
2. **Airflux를 OSS 이름으로 쓰되, AB180 제품은 "Airflux for AB180" 또는 별도 이름**.
3. **코드 네임 (예: "Lyon")을 OSS 이름으로** — 현재 branch가 `lyon-v1`이라 이미 후보.

추천: **1 (새 이름) + AB180 내부는 "Airflux" 유지**. 상표 혼동 0, 포지셔닝 깨끗, 공개 시 네이밍 마찰 없음.

### Round 8 — MCP 생태계 플레이 (트로이의 목마 후보)

Agent 1이 "Mastra MCP 패리티"를 훔칠 아이디어로 언급. 이건 깊게 팔수록 전략적 지위:

- **모든 skill/tool = MCP 서버로도 export** → Claude Desktop, opencode, Cursor, Continue가 바로 소비 가능
- **역방향**: Airflux가 MCP client도 되면, 외부 MCP 서버 모든 걸 skill로 흡수 가능
- **Discovery**: MCP registry (Anthropic 공식 + 커뮤니티)에 Airflux skills 등록되면, Airflux 없이도 Airflux skills 사용 → 유저 pull 경로
- **Anti-pattern 회피**: Airflux를 "MCP 첫 걸음이자 마지막"으로 포지셔닝 가능. 즉 "MCP 모두 관리하는 하네스".

**도출 가치**: MCP-first 하네스는 아직 명확한 카테고리 리더 없음. Airflux의 2차 포지셔닝 축이 될 수 있음. **"MCP 생태계의 home base"**는 강한 내러티브.

### Round 9 — 스케줄러는 core인가 runtime인가

현재 `packages/server`에 스케줄러 있음. 3-tier 분리 시 어디로 갈지:

- **Core에 둘 경우**: 에이전트가 `schedule` 개념을 직접 이해 → 약속이 너무 무거움. AI SDK Agent는 스케줄 개념 없음.
- **Runtime에 둘 경우 (추천)**: 에이전트는 "호출되면 실행". 언제 호출할지는 runtime 결정. Inngest Agent Kit 모델과 일치.
- **별도 `@airflux/scheduler` 패키지**: runtime 레이어 안에서도 하위 분리. 나중에 Temporal/Inngest 어댑터 추가 쉬움.

→ Runtime 안에 두되, 인터페이스는 작게 (`schedule.register(agentId, cron)` + `schedule.tick()`). 구현은 SQLite+cron 디폴트, 교체 가능.

같은 논리: **Guardrails (전부 X), Router, Feedback store, Prompt version store** 위치 결정 필요.

| 컴포넌트 | 추천 위치 | 근거 |
|---|---|---|
| Agent/Skill/Tool types | core | 순수 타입 |
| Registries | core | I/O 없음 |
| Guardrails interface | core | 타입/인터페이스만 |
| 내장 Guardrails | core (옵션 import) | pii/injection은 일반적 |
| Router | core (인터페이스) + runtime (기본 구현) | interface vs impl 분리 |
| Memory interface | core | swappable |
| Memory 기본 구현 (SQLite) | runtime | I/O |
| Scheduler | runtime | I/O |
| Feedback/Prompt version store | runtime | I/O |
| Dashboard | dashboard (3rd pkg) | UI |

### Round 10 — Skill = Markdown (OpenHands-style) 전환의 영향

Agent 1이 강하게 추천. 현재 Airflux는 `skills.yaml` + `prompts/*.md`가 나뉘어 있음. OpenHands 방식으로 통합:

```markdown
---
id: sql-analyst
triggers: ["select", "쿼리", "테이블", "DAU"]
tools: [runSql, describeSchema, chartData]
model: claude-sonnet-4
---
# SQL Analyst Skill

You are an SQL analyst for Airflux. When asked about metrics:
1. Use `describeSchema` first
2. Write read-only SELECT
3. Apply row limit 1000
4. Chart if multi-row
```

**장점**:
- 한 파일 = 한 스킬. 탐색/리뷰/PR 용이.
- Frontmatter로 메타데이터, 본문으로 프롬프트. 자연.
- Anthropic Skills, Claude Code Skills와 형식 정합 → 상호운용성.
- Git diff가 의미 있음 (YAML 구조 vs 프롬프트 텍스트 섞이지 않음).

**영향**:
- 현재 `skills.yaml` + `prompts/` 구조 해체 → 마이그레이션 스크립트 필요 (간단).
- 로더가 다르게 동작 — frontmatter 파서 추가 (기존 `gray-matter` 사용 가능).
- Prompt version store — 지금 DB에 저장, 마크다운 파일 중심으로 전환하면 git이 버전 관리 담당. SQLite prompt_versions 테이블 역할 축소.

**판단**: 분리 리팩토와 동시에 하기 좋음. 공개 형식 결정이라 나중에 바꾸기 힘듦.

### Round 11 — YAML vs Code: Projection 방향

Agent 1이 "YAML은 코드의 projection이어야 함"이라고 명시. 이건 결정적 아키텍처 원칙. 뭘 의미?

**현재 (역방향)**: YAML이 소스, 코드가 YAML 읽음.
```yaml
# agents.yaml
- id: sql-agent
  model: claude-sonnet
  skills: [sql-analyst]
```
→ `registerFromYaml(readFile('agents.yaml'))`

**권장 (정방향)**: 코드가 소스, YAML은 export/view.
```ts
// agents.ts
export const sqlAgent = defineAgent({
  id: 'sql-agent',
  model: 'claude-sonnet',
  skills: [sqlAnalystSkill],
});
```
→ YAML은 선택적 생성물 (대시보드에서 보기용, 비개발자 편집용)

**왜 중요?**
- Dify anti-pattern은 "UI가 진실" → YAML anti-pattern은 "config가 진실". 둘 다 코드를 2등 시민으로.
- 코드가 진실이면 타입 체크, IDE 자동완성, refactor, 테스트가 자연스러움.
- YAML 편집은 비개발자 워크플로 (대시보드 UI가 YAML을 생성/편집)로 국한.

**영향**: 현재 Airflux는 YAML-first. 이 원칙 채택하면 settings/ 의 일부는 "code가 생성/읽는 캐시" 처럼 재해석 필요. 리팩토 규모 커짐.

**대안**: 하이브리드 — skills는 markdown (코드 아닌 콘텐츠), agents는 코드 (structured), prompts는 markdown. YAML은 feature-flags, rbac 같은 순수 설정으로 축소.

### Round 12 — 커뮤니티 부트스트랩: 첫 10명 유저 어디서 옴

Agent 3이 "AB180 내부 사용 ≠ 커뮤니티 채택" 경고. 현실적으로 첫 10명 어디서?

현실적 경로:
1. **Show HN** — 최대 impact, 하지만 한 번뿐. "Airflux: open source agent platform..." 제목 대충 예측 100-500 upvote 수준 (카테고리 fatigue 감안).
2. **Mastra/LangChain Discord 침투** — "Mastra 쓰는데 dashboard 필요해서 Airflux 써봤어요" 같은 자연스러운 멘션.
3. **한국 개발자 커뮤니티** — 딜라이트, GeekNews, DEV.kr — AB180 지리적/언어적 우위. 초기 10-50 유저 가능성.
4. **YouTube/블로그 튜토리얼** — "5분 만에 에이전트 대시보드" 형식. AB180 직원이 쓸 시간 있나?
5. **컨퍼런스/밋업** — FEConf, PyCon KR, AI-friendly 한국 컨퍼런스에서 발표.

**현실 체크**: 1+3 조합이 가장 현실적. Show HN 한 번 + 한국 커뮤니티 sustained push. **DevRel 시간은 AB180에서 1명이 20% effort 이상 장기적으로 투입 가능해야** 커뮤니티 형성. 아니면 "오픈소스이긴 한데 아무도 안 씀" 상태 머뭄.

**도출 결정**: OSS로 공개할지 여부는 기술 문제 아니고 **인력/시간 투자 결정**. "공개만 하면 되는 거 아님".

### Round 13 — 타임라인/Phasing (언제 공개할지)

"지금 당장 OSS 공개"가 아니라 **3단계 접근** 권장:

**Phase A (지금~4주): Internal dogfood + 코어 리팩토**
- 3-tier 패키지 분리 (`core`/`runtime`/`dashboard`)
- Skill = markdown 전환
- Router = NetworkState 도입
- AB180 도메인 도구들 `@airops-ab180/tools`로 이동
- 네이밍 결정 (새 이름 or Airflux 유지)

**Phase B (4~8주): 공개 준비**
- README + docs site + `create-airflux` 템플릿
- 라이선스 (Apache 2.0) + TRADEMARK.md
- 기본 예제 5개 (echo, assistant, rag, workflow, MCP-aggregator)
- 비디오 데모 (2-3분)
- 첫 DevRel 컨텐츠 3편 (블로그/튜토리얼/사례)

**Phase C (8주+): 공개**
- Show HN (월요일/화요일 오전)
- Twitter/X 스레드 (AB180 팀 핵심 인원)
- 한국 커뮤니티 publish
- Mastra/LangChain/Dify Discord에서 "이런 거 만들었어요" 자연 소개

**Phase A 안 건너뜀** — 현재 상태로 공개하면 "AB180 내부 프로젝트 공개된 거"라는 인상. Phase A 끝나야 "범용 하네스"로 보임.

### Round 14 — 대시보드 Moat: 끈끈한 이유 만들기

Mastra playground는 dev tool. Letta ADE는 memory 관측. Airflux 대시보드는 뭘로 끈끈해질 수 있나?

**차별 축 후보**:
1. **Prompt diff/rollback UI** — 버전 간 diff, A/B 트래픽 분할, 즉시 롤백. Langfuse는 관측, Airflux는 run 가능한 편집/배포.
2. **Skill composition UI** — 스킬을 블록처럼 조합해서 새 에이전트 만드는 UI (단, 코드가 진실이므로 export는 코드 생성 또는 markdown skill 생성).
3. **Cost × Quality 히트맵** — 에이전트 × 모델 × 시간 3차원에서 "이 에이전트 gpt-5로 돌리면 비용 3배 품질 +5%" 같은 의사결정 시각화.
4. **Shadow traffic / Golden set auto-eval** — 실운영 요청을 샘플링해 자동 eval 돌리고, regression 알림. Langfuse + LangSmith가 이 영역 있지만 통합 X.
5. **MCP 서버 관리 UI** — 내부/외부 MCP 서버 카탈로그, 연결 상태, 호출 통계. 

**도출**: 1+4 조합이 가장 강함. "프롬프트가 바뀌었을 때 자동으로 regression 감지 + 즉시 롤백" 워크플로가 프로덕션 에이전트 운영의 진짜 고통. 여기 집중하면 "다른 거 다 쓰고도 Airflux 대시보드는 남김" 만들 수 있음.

### Round 15 — Memory 모델: Letta 스타일 vs 단순

Agent 1이 Letta "memory blocks" 추천. 도입 결정 고민:

**단순 디폴트 (현재 방향)**: `memory.get(agentId)` → string. 에이전트 instruction 상위에 prepend.

**Letta-style blocks**: 명시적, 크기 제한, 편집 가능한 메모리 단위들.
```ts
memory: [
  block('system_persona', { size: 500, content: "You are..." }),
  block('user_prefs', { size: 200, content: "User likes..." }),
  block('scratchpad', { size: 1000, content: "", writable: true }),
]
```

**Letta 장점**:
- 대시보드에서 각 block 편집 가능 (단순 string은 "어떻게 보여주지?")
- 컨텍스트 경쟁 (system vs user prefs vs scratchpad) 관리
- 에이전트가 자기 메모리 self-edit (archival to recall) 가능

**단점**:
- 학습 곡선 up — "memory = 그냥 context"가 아님
- API 복잡도 up

**판단**: 핵심 core primitive는 **간단 interface** (`load/save/search`), Letta 스타일은 **옵션 구현체**. `@airflux/memory-blocks` 같은 하위 패키지. 유저가 선택.

### Round 16 — Observability: 내장 vs Pluggable

Langfuse/LangSmith/Phoenix가 별도 제품이라 개발자들이 "하네스 + obs 별도" 기대. Airflux는 통합 이점 있음.

**내장 찬성**:
- "$0 trial" 스토리 유지 (별도 Langfuse 가입 불필요)
- 프롬프트 diff + 트레이스 같은 대시보드가 한 UI에 있어야 Round 14 moat 가능
- 소규모 팀에 "하나만 배포" 강점

**내장 반대**:
- Langfuse 공식 연동을 반대 세력이 "Langfuse 써도 되는데 왜 자체?"
- 트레이스 저장 인프라 무거움 (대량 데이터)

**하이브리드 (추천)**:
- **Core trace primitive** (OTel spans) — 표준 포맷
- **Default sink** (SQLite/Postgres in `@airops/runtime`) — 내장, $0 동작
- **Adapters**: Langfuse, Phoenix, LangSmith 어댑터 (옵션 패키지)
- 대시보드는 default sink 읽음. 유저가 Langfuse 선택하면 Langfuse URL로 링크.

→ 둘 다 할 수 있음. 기본으로는 즉시 동작, 대규모는 Langfuse 붙임.

### Round 17 — Eval: 코어 primitive vs 확장

Mastra는 eval 내장. Dify도. Langfuse/Braintrust는 eval을 제품으로.

**코어에 두려면**: `Agent.eval(goldenSet) → scores`. 간단 인터페이스, 내부에 LLM-judge 또는 metric functions.

**도출**: Core에는 **Scorer 인터페이스 + 기본 Scorer 3개** (exact match, LLM judge, execution success). Golden dataset 로더는 runtime. 실행 엔진도 runtime. 대시보드가 결과 시각화.

Round 14의 "shadow traffic auto-eval"는 runtime + 대시보드 합작. Core는 타입만 제공.

### Round 18 — Multi-tenancy: 언제, 어디서

현재 Airflux는 single-tenant (AB180 내부). OSS 공개 시 Multi-tenant 기대하는 유저 나올 것.

**Layer별 멀티테넌시 포지션**:
- **Core**: tenant 개념 없음. `Agent.run()`은 context.orgId 받는 정도 (옵션).
- **Runtime**: SQLite/Postgres 레벨에서 row-level org 필터링. 디폴트 `orgId = 'default'`.
- **Dashboard**: 워크스페이스 UI. Day 1 필수 아님 — Phase A에서 단일 워크스페이스 충분.
- **Enterprise package**: SSO, RBAC, audit log export, per-org usage limits.

→ **Phase A/B 릴리즈에는 single-tenant only**. Phase C+에 "Multi-org 지원 요청 있으면 고려" 수준. 초기 복잡도 낮추기.

### Round 19 — TypeScript vs Python 선택

현재 TypeScript. 생태계 영향:

**TS 우위**: Vercel AI SDK, Mastra, Inngest Agent Kit, sst/opencode 전부 TS. 프론트 통합, Next.js, Edge 배포 강점. Anthropic SDK도 TS에서 업데이트 빠름.

**Python 우위**: LangChain, CrewAI, PydanticAI, Letta, OpenHands 전부 Python. ML 엔지니어링, 노트북 통합, 데이터 파이프라인.

**결정**: TS 유지. 이유:
- Mastra/Inngest AK/Vercel 같은 TS 하네스 카테고리 명확히 존재, 경쟁자 다 TS
- AB180의 airbridge/frontend 스택이 TS
- Next.js 대시보드와 동일 언어
- Python 파이가 필요한 영역 (eval, 데이터 분석) MCP 서버 또는 자식 프로세스로 분리 가능

**리스크**: Python ML 진영 접근성 낮음. 하지만 "hrmless" 커뮤니티가 Python에 있음 — 트레이드오프 수용.

### Round 20 — Enterprise 기능 리스트 (open-core 준비)

Agent 3 추천대로 Day 1부터 `packages/enterprise/` 경계. 정확히 뭐가 enterprise?

| 기능 | Core/Runtime/Dashboard (OSS) | Enterprise |
|---|---|---|
| Agent/Skill/Tool primitives | core | — |
| 기본 Guardrails (PII, injection) | core | — |
| Single-user dashboard | dashboard | — |
| SQLite persistence | runtime | — |
| Postgres adapter | runtime | — |
| Basic feedback loop | runtime | — |
| OTel traces | runtime | — |
| LLM 어댑터 (Anthropic/OpenAI/Claude Code cred) | runtime | — |
| **SSO (SAML/OIDC)** | — | Enterprise |
| **RBAC (multi-role, per-agent permissions)** | — | Enterprise |
| **Audit log export (SIEM)** | — | Enterprise |
| **Multi-tenant workspaces** | — | Enterprise |
| **Per-agent usage quotas + billing** | — | Enterprise |
| **Managed scheduler (distributed)** | — | Enterprise |
| **Compliance packs (SOC2/HIPAA templates)** | — | Enterprise |
| **Priority support** | — | Enterprise |

→ 리스트 충분히 존재. 공개 시점에는 enterprise는 비어있어도 됨 (시그널만). 실수익은 Phase D+ (6-12개월 후).

### Round 21 — Contributor Magnet: 첫 PR 친화적 surface

Agent 3이 "좁은 surface + 빠른 머지"가 성공 패턴이라 함. Airflux에서 "첫 PR로 할만한 것" 뭐가 있나?

**친화 surface 후보**:
1. **Skill 컬렉션** (`packages/skills-community/`) — 누구나 skill markdown 추가 PR. 첫 PR 레이턴시 낮음 (코드 리뷰 가볍게).
2. **Tool 어댑터** — 특정 SaaS 툴 연동 (Slack, Notion, GitHub 등). 독립적, 테스트 쉬움.
3. **Guardrail 라이브러리** — 도메인별 (의료/금융/한국 규제 등) guardrail 추가.
4. **LLM provider 어댑터** — Bedrock, Azure OpenAI, 국내 LLM (Hyperclova 등) 지원.
5. **Deployment 가이드** — "Railway에 배포하기", "Fly.io", "Vercel" 같은 플랫폼별 가이드.

**첫 PR 안내문** (CONTRIBUTING.md 초안):
- "Good first issue": Skills 추가, Tools 추가, Docs typo
- "Hard but impactful": Core API 변경, Runtime persistence 어댑터

**도출**: skills/tools/adapters 3가지가 community pull 포인트. Core 변경은 보수적, 주변부는 개방.

### Round 22 — Production Deploy 스토리

Agent 4가 churn 원인으로 "deploy 손 놓는 프레임워크들"을 언급. Airflux 지금 deploy 스토리:

**현재 상태**: 로컬 `npm run dev`만 명확. 프로덕션은 Hono가 Lambda 호환이라는 언급 수준.

**필요한 것 (Phase B에서)**:
- **`airflux deploy` CLI 명령** — 옵션 `--target=vercel|railway|fly|aws-lambda|docker`
- **Dockerfile 표준** — `docker build . && docker run -p 3000:3000 airflux`
- **DB 마이그레이션** — SQLite(로컬) → Postgres(프로덕션) 한 줄 env 전환
- **Credential 관리** — 로컬은 Claude Code cred, 프로덕션은 API key 또는 Bedrock IAM
- **Healthcheck / readiness** — `/health`, `/ready` 표준 endpoint

**참조**: Next.js의 "vercel deploy" 혹은 Mastra의 "mastra deploy vercel" 패턴.

**Decision**: Phase B 범위에 포함. Phase A에서는 "로컬에서만" OK, 공개 시점엔 프로덕션 길 명확해야 함.

### Round 23 — 30초 피치 / Killer Demo

Show HN/Twitter에서 첫 30초가 승부. 현재 명확한 데모가 뭐?

**후보 1: "create-airflux + playground"**
- 화면: `npx create-airflux my-agent` → 15초 뒤 브라우저 자동 오픈 → 대시보드 + 플레이그라운드 + 미리 설정된 에이전트 대화 → YAML 실시간 편집 → 응답 변화.
- 포인트: "$0로 Claude Code 구독 쓰기", "한 명령으로 셋업", "로컬 대시보드".

**후보 2: "Prompt 바꾸고 롤백"**
- 화면: 에이전트가 고객 메시지 50개 처리 → 프롬프트 수정 → shadow traffic으로 5개 재처리 → regression 5건 중 2건 발견 → 자동 롤백 → 실운영 영향 0.
- 포인트: "실운영 에이전트 안전하게 개선".

**후보 3: "MCP 서버 허브"**
- 화면: Airflux 대시보드에서 외부 MCP 서버 3개 연결 (Notion, Slack, GitHub) → 에이전트가 자연스레 조합 → 결과.
- 포인트: "MCP 생태계의 조종석".

**판단**: 1이 가장 쉽게 와닿음 (create-X 패턴 익숙). 2는 프로덕션 사용자에게 강함. 3은 MCP 모르면 안 와닿음.

→ **메인 데모 = 1, 팔로업 데모 = 2, MCP 사용자용 = 3**. Show HN에는 1 써야 리치 최대화.

### Round 24 — 최종 수렴 (Converged Design)

모든 라운드 합치면 다음 결정들이 남음:

**확정 (Agent + Reflection 합의)**:
1. **3-tier 패키지**: `@airops/core` + `/runtime` + `/dashboard`
2. **라이선스**: Apache 2.0 + AB180 copyright + DCO + `packages/enterprise/` 경계
3. **카테고리 포지셔닝**: "code-first, local-first, fullstack OSS agent harness"
4. **언어**: TypeScript, Python 안 함
5. **Phase A/B/C 타임라인**: 리팩토 → 공개 준비 → 공개
6. **Skill = markdown + frontmatter** (OpenHands/Anthropic Skills 정합)
7. **YAML ≠ 진실의 원천. 코드가 진실, YAML은 projection**
8. **MCP 패리티 (client + server 양방향)** 2차 포지셔닝 축
9. **Observability 하이브리드** (default sink + Langfuse adapter)
10. **Enterprise 기능**: SSO, RBAC, multi-tenant, audit export (open-core 미래)
11. **Deploy CLI + Dockerfile 표준** (Phase B 필수)
12. **Killer demo = create-airflux + playground**

**미결정 (유저에게 물어야 함)**:
1. **OSS 프로젝트 이름** — "Airflux" 유지 vs 새 이름 (Round 7)
2. **공개 시점** — Phase C 언제 (4-12주 사이)
3. **DevRel 리소스** — AB180에서 20%+ 투입 가능한 사람 있나
4. **우선순위**: 지금 AB180 내부 유스케이스 vs OSS 준비 어느 쪽 drive?
5. **Router/NetworkState 업그레이드** — 분리 리팩토와 동시 vs 별개 타이밍
6. **DB 기본값** — SQLite만 vs Postgres 어댑터 Phase A에 포함

### Round 25.5 — 비전 v2 충격파 (이전 라운드 뒤집힘)

사용자 비전 v2 = "팀 협업 플랫폼"으로 바뀌며 뒤집히는 라운드들:

- **Round 18 (멀티테넌시 Phase A 제외)** → **뒤집기**. Workspace/Project가 core primitive. Day 1에 있어야 함.
- **Round 20 (RBAC = Enterprise only)** → **뒤집기**. 기본 RBAC는 OSS에 있어야. Enterprise는 SSO/SCIM/감사로그/Compliance pack.
- **Round 5 (위협 지형)** → **경쟁자 재배치**. Mastra/Letta는 여전히 참조지만, 진짜 경쟁은 Dify(협업 지향) + Retool(내부 도구) + 일부 Langfuse(팀 observability).
- **Round 23 (Killer demo)** → **데모 갈아엎기**. "create-airflux + playground" 대신 "**우리 팀이 공유하는 에이전트 3초 안에 초대받아서 쓰기**"가 더 강함.
- **Round 13 (Phase 타임라인)** → **Phase A 범위 확장**. 2주 → 3-4주. 워크스페이스 + 권한 모델 추가.

### Round 26 — 프로젝트 타입 시스템 (pluggable project types)

사용자 v2: "프로젝트는 코드 관리용 / 문서용 / 목표 기반용 — 타입 선택". core primitive로 추상화:

```ts
interface ProjectType {
  id: string;                       // 'code-repo' | 'docs' | 'objective'
  schema: ResourceSchema;           // 이 타입이 가지는 리소스 구조
  connectors?: ExternalConnector[]; // GitHub/Notion/Jira 연결 옵션
  ui: ProjectDashboardUI;           // 타입별 전용 UI 컴포넌트
}
```

**Built-in 타입 3개** (Phase A에서):
1. **`code-repo`** — Git 레포 바인딩. 에이전트는 코드 읽기/쓰기/PR 생성 가능. GitHub/GitLab 커넥터.
2. **`docs`** — 문서 중심. Notion/Google Drive 커넥터. 에이전트는 문서 읽기/편집/요약.
3. **`objective`** — 목표/이니셔티브 기반. Jira/Linear 커넥터. 이슈 읽기/생성/상태 전이.

**확장성**: 4번째 타입(예: `kanban`, `wiki`, `dataroom`)은 플러그인으로. ProjectType 인터페이스 만족하면 OK.

**중요 원칙**: 프로젝트 타입은 UI/커넥터 차이지, **core primitive(리소스, 권한, 에이전트)는 동일**. 타입에 의존하는 기능 최소화.

### Round 27 — 자산 스테이트 머신 (Personal → Team Promotion)

Git-fork-PR 모델과 유사:

```
[개인 drawer]               [팀 프로젝트]
  ↓ create                    ↓
  agent-draft (personal)      
  ↓ iterate/test              
  ↓ request-promotion  →    agent-under-review
                              ↓ review (reviewers comment)
                              ↓ approve
                            agent-published
                              ↓ use (실행 권한자들이 사용)
                              ↓ deprecate
                            agent-archived
```

**상태**: `personal-draft` / `under-review` / `published` / `deprecated` / `archived`

**리뷰 워크플로**:
- 에이전트 promote 요청 시 프로젝트의 **maintainer** 검토
- 리뷰어는 프롬프트 diff, golden-set eval 결과, 비용 시뮬레이션을 한 화면에서 봄
- 승인 전까지 실행자들에게 노출 X

**왜 중요?**
- "누가 우리 프로덕션 에이전트 건드렸어?" 문제 해결
- Regulated 도메인 (금융/의료/컴플라이언스) 기본 요구사항
- GitHub PR 멘탈모델이라 개발자에게 친숙
- **이게 Dify 대비 차별화 포인트** — Dify는 "누구나 UI에서 수정"

**구현 영향**: 에이전트 버저닝이 Git-like (branches, merges, tags) 되어야. 현재 SQLite prompt_versions 테이블 확장 필요.

### Round 28 — 상태 관리 통합 (Jira/Linear 연결 vs 자체 제공)

사용자 v2: "Jira/Linear 연결 or 플랫폼 자체가 팀 상태관리 도구".

**옵션 A: Connector only (추천 초기)**
- 외부 이슈 트래커(Jira/Linear/GitHub Issues) 커넥터만 제공
- 에이전트가 이슈 읽고/쓰고/상태 전이
- 플랫폼은 "이슈 관리 도구"가 아님, "에이전트 + 이슈 통합"

**옵션 B: 자체 이슈/태스크 관리**
- 프로젝트 안에 내장 태스크 보드 (Kanban/List)
- 에이전트가 태스크 생성/실행/완료 처리
- Jira 대체 가능

**옵션 C: 하이브리드 (추천 장기)**
- 기본 내장 (옵션 B의 최소 버전, "인박스"+"Task" 정도)
- 커넥터로 외부 도구와 양방향 동기화 (옵션 A)
- 팀이 Jira 이미 쓰면 connector-only, 아니면 내장으로 출발

**판단**: **옵션 C, but Phase A는 옵션 A부터**. 초기에 이슈 관리 도구 만들면 scope 폭발. 커넥터만.

**Airflux만의 가치**: 에이전트를 **팀 멤버 취급** — 이슈 assignee로 에이전트 지정 가능. "이슈 ENG-1234를 sql-agent에게 위임" → 에이전트가 이슈 읽고 실행 시도 후 댓글/상태 업데이트. **이게 Lindy/Decagon과 다른 포지션 (그들은 외부 customer agent, Airflux는 내부 팀 멤버)**.

### Round 29 — 역할/권한 모델 심화

사용자 v2: "역할 분리 매우 중요". 구체적 모델:

**조직 × 프로젝트 × 리소스 3-tier 권한**

```
Organization
  ├─ members (admin / member / viewer)
  └─ Projects
       ├─ Project (visibility: private / internal / public)
       ├─ members (maintainer / contributor / runner / viewer)
       └─ Resources (agent / skill / tool / prompt / secret)
            └─ resource-level ACL (override project default)
```

**5가지 기본 역할**:
- **Org Admin**: 조직 전체 (멤버 초대, 프로젝트 생성, 빌링)
- **Maintainer**: 프로젝트 소유자 (에이전트 publish/deprecate, 멤버 관리)
- **Contributor**: 에이전트 편집 제안 (promotion request), 리뷰어가 승인해야 발효
- **Runner**: 퍼블리시된 에이전트 실행만 (프롬프트 편집 X)
- **Viewer**: 읽기만

**핵심 구분**: **Contributor(제안) ≠ Maintainer(발효)** — Dify와 차별화. Dify는 "UI 접근권한" 있으면 직접 수정.

**리소스별 override**: 특정 에이전트에 "runner는 실행 가능하지만 log는 못 본다" 같은 세밀 규칙.

**Secret 취급**: API key, DB 커넥션 등. Maintainer만 작성, Runner는 이름만 참조. 노출 안 됨.

**개인 drawer의 권한**: 개인 drawer는 single-user 소유. 팀 프로젝트와 완전 분리.

### Round 30 — 외부 연동 (Connectors) 1st-party 목록

팀 협업 플랫폼이 되려면 외부 도구 연결이 기본. Phase A/B 범위:

**Phase A (Day 1 기본)**:
- **GitHub** — 레포, 이슈, PR (code-repo 프로젝트 타입용)
- **Slack** — 봇/알림 (에이전트 결과 팀 공유)
- **Jira** / **Linear** — 이슈 읽기/쓰기 (objective 프로젝트 타입용)
- **Google Drive** / **Notion** — 문서 (docs 프로젝트 타입용)

**Phase B**:
- **PagerDuty** / **Opsgenie** — 알람/승인 흐름
- **Sentry** / **Datadog** — 관측 소스에서 이슈 자동 생성
- **Figma** — 디자인 컨텍스트
- **HubSpot** / **Salesforce** — 영업/고객 도메인

**Phase C+ (커뮤니티 기여)**:
- 나머지는 CONTRIBUTING에 guide 해서 커뮤니티 PR로

**커넥터 공통 인터페이스**:
```ts
interface Connector {
  id: string;
  auth: OAuth2 | APIKey | OIDC;
  tools: Tool[];                // 이 커넥터가 제공하는 tools (MCP 스타일)
  resources: ResourceProvider[]; // 이 커넥터가 제공하는 읽기 리소스
  events?: EventSource[];       // webhook 수신 (Slack 멘션, 이슈 변경 등)
}
```

**MCP와 관계**: Connector는 내부적으로 MCP 서버로 구현 가능. 결국 **Airflux 커넥터 = 1st-party MCP 서버들**. 커뮤니티는 순수 MCP로 기여 → Airflux가 UI/Auth/관측 제공.

### Round 31 — Phase A 스프린트 재정의 (v2)

v1 Phase A (2주) → v2 Phase A (3-4주):

**Week 1: Core 리팩토 (기존 플랜)**
1. `packages/core` 추출: types, registries, Guardrails interface, Router interface + NetworkState
2. `packages/runtime` 분리: SQLite store, scheduler, env layer
3. `packages/dashboard` SDK 사용 리팩토

**Week 2: 협업 primitives (신규)**
4. **Org/Project/Member 모델** 추가 — SQLite 스키마 확장 (`orgs`, `projects`, `memberships`, `project_memberships`)
5. **역할/권한 시스템** — 5개 기본 역할, 리소스별 ACL
6. **개인 drawer** — 각 유저에 bootstrap 시 drawer 자동 생성
7. **Auth** — 로컬은 `AIRFLUX_USER` env, 프로덕션은 OIDC (플러그인)

**Week 3: 자산 promotion + 프로젝트 타입**
8. **Promotion workflow** — `personal-draft → under-review → published` 상태 + 리뷰 UI
9. **ProjectType 추상화** — code-repo / docs / objective 3종 scaffold
10. **Connector 인프라** — GitHub / Slack / Jira 1st-party 3개 (나머지 Phase B)

**Week 4: 도메인 분리 + 폴리시**
11. `@airops-ab180/tools` fork, bootstrap.ts L217-400 이동
12. Skill markdown 마이그레이션
13. 내부 dogfood: AB180 팀 2-3개로 이 플랫폼 써보기

**3주 대비 4주가 현실적**. 협업 모델은 데이터 모델 + UX + 리뷰 워크플로 다 얽혀서 복잡.



**즉시 (이번 주)**:
1. 위 1-6 유저 결정 받기
2. 네이밍 후보 5개 정리 (유저 결정 1 후속)
3. `packages/enterprise/` 빈 폴더 생성 + LICENSE 헤더 초안

**Phase A 2주 스프린트**:
1. `packages/core` 추출: types, registries, guardrail interface, Router interface
2. `packages/runtime` 분리: SQLite store, scheduler, env layer
3. `packages/dashboard` 정리: API routes 공개화, SDK 사용하도록 리팩토
4. Skill markdown 마이그레이션 스크립트
5. `@airops-ab180/tools` fork 레포 생성, bootstrap.ts L217-400 이동
6. Router NetworkState 업그레이드 (Round 6 도출)

**Phase B 2주**:
1. `create-airflux` CLI
2. Dockerfile + deploy 가이드 3개 (Vercel/Railway/Docker)
3. README + docs site (`docs.airflux.dev` 또는 새 이름)
4. 예제 5개
5. 라이선스 + TRADEMARK + CONTRIBUTING

**Phase C (공개 주간)**:
1. Show HN 제출 (월/화 오전 9시 KST = 전날 저녁 PT)
2. Twitter 스레드 동시 발행
3. 한국 커뮤니티 순회
4. AB180 엔지니어 3명 이상 댓글 커뮤니티 반응 수집

---

---

## User Decisions (확정)

| # | 질문 | 답 |
|---|---|---|
| Q1 | OSS 프로젝트 이름 | **airops** 확정 — `@airops/*` 네임스페이스, "agent ops" 약어, 포지셔닝 일치 |
| Q2 | 공개 시점 | **내부 검증 먼저** — Phase C는 추후 결정. Phase A/B 끝난 뒤 dogfood 결과 보고. |
| Q3 | DevRel 리소스 | **미정** — Phase C 진입 전에 결정. 없으면 내부용만 유지. |
| Q4 | 우선순위 | **동시 진행** — 내부 유스케이스와 OSS 준비 병행. AB180 도메인 layer는 `@airops-ab180/` 별도 관리. |
| Q5 | Router NetworkState 타이밍 | **Phase A 내 동시** — 공개 API 고정 전에 shape 확정 |
| Q6 | DB 기본값 | **로컬 SQLite, 팀 배포 multi-DB** — 하이브리드. 개인 drawer/로컬 개발 = SQLite 자동. 팀 프로젝트/프로덕션 = Postgres/MySQL 어댑터 선택. |

### Q6 세부 (사용자 직관)
- **로컬 모드**: SQLite 한 방 실행. zero config.
- **팀 모드**: Postgres 기본 추천, MySQL 어댑터 옵션, 향후 Supabase/Neon 같은 managed 지원.
- **Core는 DB-agnostic** — adapter 인터페이스만 정의, 구현은 runtime에.
- **마이그레이션 경로**: "개인 drawer 잘 쓰다 팀으로 옮길 때 SQLite→Postgres 원샷 마이그레이션 CLI" 제공 가능.

## Open Decisions (미해결, Phase B 전까지 OK)

- **DevRel 투자** — Phase C 진입 조건
- **공개 시점** — 내부 dogfood 결과 보고 판단 (6-12주 구간)
- **상용화 전략** — Phase D+ (6-12개월 뒤). 지금 commit X.

## Final Recommended Design

### 한 줄 (v2 — 확정)
**"airops — 팀이 공동 운영하는 에이전트 협업 플랫폼. 코드-퍼스트 OSS. 개인 drawer로 시작, 검증 후 팀 프로젝트로 promote. 프로젝트는 타입 선택형(code-repo/docs/objective), 역할 분리 기본, Jira/Slack/GitHub 등 커넥터 내장."**

### 프로젝트 이름
- **airops** (확정). "agent ops"의 약어. 포지셔닝 = 에이전트를 "만드는" 도구가 아니라 "운영하는" 도구.
- Namespace: `@airops/core`, `@airops/runtime`, `@airops/dashboard`, `@airops/enterprise`
- AB180 내부 layer: `@airops-ab180/tools`, `@airops-ab180/settings`
- 기존 "Airflux" 브랜드는 AB180 내부 프로덕트 이름으로 유지 가능 (혼동 없음).

### 핵심 구조
```
@airops/core        — Agent/Skill/Tool primitives, NetworkState, Router interface (no I/O)
@airops/runtime     — SQLite/Postgres, scheduler, OTel sinks (swappable)
@airops/dashboard   — Next.js reference UI (optional, --no-dashboard 지원)
@airops/enterprise  — SSO/RBAC/multi-tenant/audit (future, open-core 경계 Day 1)

ab180/airflux-reference (private)
  @airops-ab180/tools    — Snowflake 도구, 한국어 glossary
  @airops-ab180/settings — semantic-layer, domain-glossary, AB180 agents
```

### 핵심 차별화 축 3개
1. **Claude Code 크레덴셜로 $0 trial** — 아무도 안 하는 로컬-퍼스트 훅
2. **Prompt version + shadow traffic + auto-rollback** — 프로덕션 에이전트 운영의 실제 고통 해결
3. **MCP-first 하네스** — "MCP 생태계의 조종석" 포지션

### 피해야 할 anti-patterns
- "framework" 단어 사용 (fatigue)
- BSL/ELv2 (Mastra 실수)
- UI가 진실의 원천 (Dify drift)
- Day 1 CLA
- Hosted-only 대시보드
- Multi-tenancy Phase A 포함 (복잡도 폭발)

### 리스크 상위 3개
1. Mastra가 OSS-fat 확장 (12개월 내 시장 gap 닫힘)
2. Anthropic이 Claude Agent SDK로 풀스택 제공
3. AB180에 DevRel 리소스 부족 → "공개만 하고 아무도 안 씀"

### 첫 스프린트 (2주, Phase A)
1. `packages/core` 추출
2. `packages/runtime` 분리 (SQLite/scheduler/env)
3. `packages/dashboard` SDK 사용 리팩토
4. Skill = markdown 마이그레이션
5. `@airops-ab180/tools` private fork 생성, bootstrap.ts L217-400 이동
6. Router NetworkState 업그레이드 (공개 API 고정 전에)

---

## Worktree Progress (dar-es-salaam-v2, PR #11 merged)

**이미 구현된 것** (2026-04-22 기준, 392 tests green):

### airops CLI (신규 `packages/cli/` workspace)
- **커맨드**: `airops start [--open]`, `stop [--reset]`, `status`, `db {url|psql|dump|restore|reset}`
- **아키텍처 변경**: **Native server/dashboard + Docker(postgres만)** — "전부 Docker" 버림. Keychain/Terminal 자유 접근 가능.
- **포트 Z 전략**: `get-port`로 server 3100-3199, web 3200-3299 자동 선점. 충돌 시 autobump.
- **Postgres 강건**: 컨테이너/볼륨 고정 이름 (`airops-pg`/`airops-pgdata`), 재사용/재시작/신규 자동 판정, 데이터 영속.
- **State**: `.airops/state.json` — PID/포트/컨테이너 기록. `process.kill(pid, 0)`로 stale 감지 → fresh start.
- **Lifecycle**: foreground 실행, `[pg][server][web]` 색 구분 prefix 로그, Ctrl+C에 web→server→pg 순서 SIGTERM 5s grace → SIGKILL.
- **Fail-fast**: auto-restart 없음. 자식 죽으면 명시적 에러 + 나머지 정리 + exit 1.
- **`findRepoRoot()`**: 어떤 서브디렉토리에서도 `npx airops` 동작 (packages/cli/src/repo-root.ts).
- **`airops db`**: GUI 연결 URL, psql 세션, dump/restore, volume reset.
- **에러 UX**: Docker daemon 꺼짐, Docker CLI 없음, 포트 범위 포화, pg healthcheck 실패 등 각 케이스 한국어 메시지.

### Server Keychain 직통 (packages/server/src/llm/model-factory.ts)
- macOS 호스트 실행 시 `security find-generic-password` CLI로 Keychain에서 Claude credentials 직독.
- Linux/컨테이너/Windows에서는 파일 fallback (`~/.claude/.credentials.json`).
- **"Claude 만료 sync" 개념 자체 제거** — 호스트 native Claude Code가 refresh 하면 server가 즉시 최신 토큰 사용.
- **"$0 trial" 스토리 완성** — 유저가 credential 관리 고민 0.

### Availability-first Routing
- `packages/server/src/llm/claude-throttle.ts` — 429/402/header 기반 throttle 감지 + `resetAt` 우선.
- Threshold 비활성 기본값. 중간 프록시 에이전트가 사용 가능한 provider 자동 선택.
- `/api/health`에 `mode: 'local'|'production'` + `llm.claudeThrottle` 노출.
- `routes/query-stream.ts`: availability-first 라우팅 재작성.

### Dashboard — Provider-independent 배너
- Claude/Codex 각각 독립 렌더링. 한 쪽 이슈는 warn, 양쪽 이슈는 error.
- 배너 라벨링: raw source 문자열 → 사람 친화 라벨 ("ChatGPT Codex · OAuth", "Keychain 토큰 (env) · sync 필요" 등).
- Rate-limit quota 바: Claude unhealthy 시 숨김 (stale 값 표시 모순 해소).
- 배너/설정 페이지에 `📋 bash scripts/sync-claude.sh` 클립보드 복사 버튼 (Docker 레거시 path 유지).

### Light/Dark/System 테마 토글
- `next-themes` + `<ThemeProvider>` wrapping.
- Sidebar 하단 3-way 순환 토글, hydration placeholder.
- 색상 전부 `text-{c}-700 dark:text-{c}-200` 패턴. hljs는 `github.min.css` + `.dark .hljs*` override 45 selectors.

### Server Bug fixes (별개 흐름)
- AI SDK v6 breaking change: `parameters` → `inputSchema` (assistant-agent, subagent 둘 다).
- Codex tool-call `store:false` + multi-turn: `flattenStoredItemReferences()` — `item_reference` 플래튼 + 고아 `function_call_output`을 assistant message로 변환.

### 테스트
- server 254 + core 93 + cli 45 = **392 tests green**.
- Dashboard tsc clean (vitest 인프라는 별도 PR).

---

## Phase A 스프린트 재정의 (v2.1 — worktree 반영)

### ✅ Done (dar-es-salaam-v2, PR #11)
- `airops` CLI (단일 실행 진입점)
- Native + Docker(postgres-only) 하이브리드 로컬 실행
- macOS Keychain 직통 (sync 제거)
- Availability-first routing + claude-throttle
- Provider-independent 대시보드 배너
- Light/Dark 테마
- 포트 Z 전략 + Postgres 강건
- `findRepoRoot` (portable CLI)

### ✅ Done (lyon-v1, 2026-04-23 세션)
- `findRepoRoot` 일반화: `airops.config.json` marker + `package.json` `airops` 필드 + legacy 이름 호환 (2 새 테스트)
- 루트에 `airops.config.json` 배치
- `packages/runtime` 스캐폴드 (Storage/Scheduler/TraceSink 인터페이스 + smoke test)
- **P1 Router NetworkState**: `NetworkState<T>` 타입 + helper + Router state-aware 통합. 3 state test + 5 router-state test 추가 (12 router total green)
- **P2 Skill markdown loader**: frontmatter 파서 (5 test) + `loadSkillsFromMarkdownDir` (6 test) + `SkillDefinition` 확장 (`triggers?`, `instructions?`)
- **P2.5 Bootstrap wiring**: `settings/skills/*.md` 자동 로드 → `SkillRegistry` 등록 (YAML 호환 유지)
- **P1 follow-up**: `/api/query`가 NetworkState 생성 + router에 전달 + debug 응답에 `routing.history` 노출
- **P2.9 Skill instructions 주입**: `assistant-agent.ts buildSystemPrompt`이 skill의 markdown body를 "## 활성 스킬" 섹션으로 system prompt에 포함
- CLAUDE.md에 v2 airops 비전 + `@airops/*` 토폴로지 + `airops start` 권장 추가
- 본 vision spec 파일을 `docs/superpowers/specs/` 영구 자산으로 이동
- 예시 skill (`settings/skills/example-sql-analyst.md`) 추가

**테스트 총합**: core 기존 + 11 new (frontmatter 5 + skill-md 6 + network-state 3 + router-state 5 — router-state는 기존 파일에 추가) + 서버 254 + cli 52 + runtime 1 smoke = 전체 green

### ⏳ Remaining (본 플랜 Phase A 범위)

**Week 1: Core 분리 리팩토**
1. `packages/core` 추출: types, registries, Guardrails interface, Router interface + NetworkState
2. `packages/runtime` 분리: SQLite store, scheduler, env layer
3. `packages/dashboard` SDK 사용 리팩토

**Week 2: 협업 primitives (v2 비전)**
4. Org/Project/Member 모델 (SQLite 스키마 확장)
5. 역할/권한 시스템 (5개 기본 역할, 리소스별 ACL)
6. 개인 drawer auto-bootstrap
7. Auth — 로컬은 `AIROPS_USER` env, 프로덕션은 OIDC 플러그인

**Week 3: 자산 promotion + 프로젝트 타입**
8. Promotion workflow (`personal-draft → under-review → published`)
9. ProjectType 추상화 (`code-repo` / `docs` / `objective`)
10. Connector 인프라 (GitHub / Slack / Jira 1st-party 3개)

**Week 4: 도메인 분리 + 폴리시**
11. `@airops-ab180/tools` fork, bootstrap.ts L217-400 이동
12. Skill markdown 마이그레이션
13. 내부 dogfood (AB180 팀 2-3개)

### Phase A 총 소요 (현실)
- worktree PR #11 = 약 1주 분량의 작업을 **이미 완료** (CLI + DX + credentials)
- 남은 Week 1-4 = 약 **3-4주 추가 소요**
- **내부 검증 먼저** (Q2 결정) 이후 Phase B 여부 재판단

---

## Round 32 — Worktree 성과의 전략적 의미

1. **"$0 trial" 스토리가 실증됨** — Keychain 직통으로 로컬 dev = 크레덴셜 제로 관리. Round 24에서 "#1 differentiator"로 꼽은 것이 실제 동작.
2. **Native + Docker-lite 아키텍처** — 원래 플랜의 "로컬-퍼스트" 원칙을 강화. "docker compose up → 끝"이 아니라 "`airops start` → 호스트 자원 자유 접근 + DB만 격리" 모델. Mastra 같은 경쟁자가 모방하기 어려운 UX (macOS Keychain 직통은 그들 Cloud-first 모델과 맞지 않음).
3. **CLI = 플랫폼 진입점이자 브랜드** — `airops start` 한 명령이 브랜드 내러티브 담음. `create-airops` 템플릿 (Phase B) 대신 **기존 레포에 `airops` CLI가 붙는 모델**이 될 수도. 타 프로젝트가 이 CLI만 설치해서 에이전트 플랫폼으로 활용.
4. **Fail-fast + 강건 Postgres 모델** — 팀 배포 시에도 쓸 수 있는 철학. Q6(DB 하이브리드)와 정합.
5. **Provider-independent 대시보드** — Claude/Codex 독립 렌더링. 향후 다른 모델 provider 추가 (Bedrock, Gemini, Hyperclova 등) 확장 시 패턴 확립됨.
6. **`--reset` 같은 데이터 파괴 커맨드에 확인 프롬프트** — 팀 협업 플랫폼에서 매우 중요한 안전 관습이 이미 선제 적용됨.

## Round 33 — 남은 긴장/미해결 질문

1. **CLI `airops` vs 패키지 네임스페이스 `@airops/*`**: 현재 worktree 커밋은 `@ab180/airops-cli` (scoped, 사내). OSS 공개 시 `@airops/cli`로 rename 필요. 지금 이미 `findRepoRoot`에서 `name === 'airflux-agent-platform'` 하드코딩 — 이 체크도 `airops/*` 또는 복수 이름 수용으로 바꿔야.
2. **Skill markdown 전환 vs 기존 YAML**: 아직 skills.yaml + prompts/*.md 구조. Phase A Week 3에 마이그레이션 스크립트 필요.
3. **NetworkState 도입 타이밍**: 공개 API 고정 전이 원칙(Round 6). 현 CLI는 core API 변경 없이 작동 중 → **Week 1 core 추출 시 동시 업그레이드** 권장.
4. **팀 배포 시 `airops start` 모델?**: 로컬 CLI가 프로덕션에서도 쓰일 이유는 없음. 프로덕션은 기존 `environment.ts` 분기 + 컨테이너/Lambda. 근데 self-hosted Ubuntu 서버는 회색 — `airops start --server-only`? 아니면 별도 `airops server` 모드?
5. **OSS 레포 분할 경로**: 현재 `ab180/airflux-agent-platform` 한 레포. OSS 공개 시 (a) 같은 레포로 감 (monorepo 그대로) vs (b) `airops/airops` 신규 레포로 split. 후자는 `@airops-ab180/*` 자동 분리 가능하지만 커밋 히스토리 분할 리팩토 필요.

### Round 34 — `--local` vs `--team` 모드 분리 (아키텍처 축)

사용자 확인: **`airops start --local`은 지금 구현된 Keychain 경로, `--team`은 제대로 된 API key 필수**. 이건 플랫폼 전체의 dominant switch.

**두 모드 프로파일**

| 측면 | `--local` (개인) | `--team` (팀/프로덕션) |
|---|---|---|
| **Credential** | Keychain 직통 (Claude Code 구독) / `~/.claude/.credentials.json` | **API key 필수** — `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, Bedrock IAM, Internal Agent API |
| **Storage** | SQLite (`.airops/drawer.db`) | Postgres / MySQL / managed (Supabase/Neon) |
| **Auth** | 단일 유저 (`AIROPS_USER` env 또는 OS user) | OIDC / SSO / 초대 기반 |
| **Secrets** | OS keychain / env | Secret store (AWS SM / Doppler / Infisical) |
| **자산 스코프** | 개인 drawer | Org × Project × Resource ACL |
| **RBAC** | 없음 (본인=owner) | 5-role 모델 풀 가동 |
| **Observability** | 로컬 SQLite traces | OTel → Langfuse/Phoenix 선택 adapter |
| **Deployment** | 호스트 native + Docker(pg) | 컨테이너 배포, managed DB, LLM 게이트웨이 |
| **사용 맥락** | "노트북에서 내가 잠시" | "우리 팀이 프로덕션 에이전트 운영" |

**Credential 로직 재정의** (`packages/server/src/llm/model-factory.ts`)
```ts
function resolveCredentials(mode: AiropsMode): LLMCredentials {
  if (mode === 'local') {
    // macOS → Keychain / Linux → file / Windows → %APPDATA%
    return readPersonalCredential();
  }
  // mode === 'team'
  // API key 필수. 없으면 server startup 거부.
  const key = process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Team mode requires ANTHROPIC_API_KEY or OPENAI_API_KEY');
  return { kind: 'api-key', token: key };
}
```

**`environment.ts` 통합**
- 현재 3분기 (Lambda / Internal Agent API / local) → 2축으로 재정리:
  - **Mode**: `local` (single-user) / `team` (multi-user)
  - **Deployment**: `dev` (호스트 native) / `container` (Docker/Lambda/K8s)
- `--local` = `mode: local, deployment: dev` (현재 worktree 구현)
- `--team` = `mode: team, deployment: dev` (온프렘 팀 서버) or `mode: team, deployment: container` (클라우드)

**CLI 변경**
- `airops start` 기본은 `--local`
- `airops start --team` → Postgres 필수 + API key 필수 + Auth 설정 확인 후 boot
- `airops start --team --init` → 첫 팀 설정 wizard (workspace 생성, owner 초대, connector 설정)

**상태 머신 (local → team promotion)**
```
[내 노트북]                    [팀 서버]
airops start --local
  ↓ 에이전트 만들고 테스트
  ↓ 충분히 검증
  ↓ airops promote --to-team <url>
                               airops start --team (기존 운영 중)
                               ↓ under-review 상태로 들어감
                               ↓ maintainer 승인
                               agent published
```

이 promotion 경로는 Round 27 자산 스테이트 머신 + Q6 DB 하이브리드 + 모드 스위치가 한 흐름으로 묶임. **"개인에서 팀으로"가 기술적으로 연속적인 경험**.

**Phase A Week 2에 반영**
- Org/Project/Role 모델 구현할 때 `--team` 모드 활성화 조건으로 묶기
- `--local`에서는 이 primitive 무시 (단순 single-user flow)
- 테스트에 두 모드 각각 smoke 시나리오 추가

**검증 시나리오 추가** (Spec §8 확장)
- `airops start --local` → Keychain 토큰 사용, API key env 없어도 동작
- `airops start --team` with API key → 정상 boot + 워크스페이스 UI 노출
- `airops start --team` without API key → startup 거부 + 친절한 에러
- `airops promote --to-team` → 개인 drawer 에이전트가 팀 under-review로 이동

