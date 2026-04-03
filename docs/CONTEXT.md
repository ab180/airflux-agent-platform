# Project Context — 이 프로젝트가 여기까지 온 과정

> 새 세션의 Claude가 읽어야 할 배경 맥락. CLAUDE.md는 "무엇을 만드는가", 이 파일은 "왜 이렇게 되었는가".

## 1. 프로젝트 기원

AB180에는 'abot'이라는 사내 Slack 봇이 있다 (코드명 Montgomery). Node.js + SST v3 + Dual-Lambda 구조로 `/find_app`, `/sdk`, `/500`, `/lag` 등의 슬래시 커맨드를 처리한다.

사용자(AB180 직원)는 AB180의 신규 프로덕트 **Airflux**를 위한 별도 에이전트 시스템을 구축하려고 했다. 처음에는 Montgomery에서 영감을 받아 Slack 봇 형태로 시작했지만, 100+ 라운드의 설계 과정에서 **에이전트 관리 플랫폼**으로 진화했다.

## 2. 핵심 방향 전환들

### 전환 1: "SQL 봇" → "에이전트 플랫폼"

초기에는 Text-to-SQL이 핵심 기능이었다. 하지만 사용자가 명확히 정정:

> "SQL을 생성하는게 이 에이전트의 큰 목적이 아니라니까. 에이전트 시스템이 중요하다고. SQL 생성하는건 별도 dbt 프로젝트에서 제공할거라 상관없고, 자유롭게 에이전트를 지정하고 강화하고 관리하고 업무에 편하게 사용할 수 있는 프로젝트가 되어가야 하는게 중요."

**결론**: SQL Agent는 하나의 스킬일 뿐. 프로젝트의 본질은 에이전트를 자유롭게 등록/관리/실행하는 플랫폼.

### 전환 2: "Slack 전용" → "멀티 엔드포인트"

Montgomery는 Slack 전용이지만, Airflux Agent는:
- 웹앱(기본) — 관리 대시보드 + 채팅
- REST API — 다른 서비스에서 호출
- Cron — 자동 리서치, 정기 리포트
- Webhook — 외부 이벤트 트리거
- Slack, Email — 나중에 채널로 추가
- MCP — Claude Code 연동

### 전환 3: "Slack Admin" → "웹 대시보드"

처음에 관리 인터페이스로 `/airflux-admin` 슬래시 커맨드를 설계했으나, 사용자가:

> "slack admin은 고민안했음"

**결론**: 관리는 웹 대시보드. Slack은 사용 채널일 뿐.

### 전환 4: "API 키 구매" → "Claude Code 크레덴셜"

비용 문제로 별도 API 키를 사용하기 어려움:

> "API Key를 못쓴다구 ㅠ 돈 더 나가고 해서 힘들어."

SSO/OAuth 탐색 과정에서 발견:
- Anthropic은 3자 앱에서 구독 크레딧 사용을 **명시적으로 금지** (2026/01부터)
- 하지만 로컬에서 본인이 돌리는 건 3자 앱이 아님
- Conductor.build가 Claude Code 크레덴셜을 읽어서 사용하는 선례

**결론**: 로컬 → Claude Code 크레덴셜 (`~/.claude/.credentials.json`). 인프라 → AWS Bedrock 또는 내부 Agent API.

### 전환 5: "인프라 먼저" → "로컬 먼저"

> "초반에는 인프라에 안 올리고 로컬에서 계속 시도해볼것"

**결론**: Phase 0-1은 로컬 개발. `npm run dev` → `curl localhost:3000`. 인프라 배포는 Phase 2에서.

## 3. 절대 하지 말 것

### LiteLLM 사용 금지
2026년 3월 공급망 공격으로 악성 PyPI 패키지 배포. CVE 9개 이상 (SQL injection, SSRF, 임의 코드 실행). $10B 스타트업 Mercor가 4TB 데이터 유출. **어떤 상황에서도 사용하지 않는다.**

### Bifrost 프로덕션 사용 주의
기술은 좋지만 (Go 기반, 11μs 오버헤드), $3M 시드만 받은 1년 된 회사. 검증된 프로덕션 사용자 0건. DEV.to 마케팅 공세 (독립적인 척하는 블로그가 전부 Maxim 관계자). **6개월 후 재평가.**

### SQL 중심 설계 금지
이 프로젝트의 목적은 "SQL 잘 생성하는 봇"이 아니다. SQL Agent는 하나의 스킬일 뿐.

### 에이전트 설정을 코드에 하드코딩 금지
운용 파라미터(모델, 스킬, 스케줄, 비용 한도)는 YAML 설정으로 관리. 코드 배포 없이 변경 가능해야 함.

## 4. 사용자의 원래 비전 (원문)

> "내가 이 프로젝트에서 하고싶었던 건 사내 에이전트를 자유롭게 등록/개선/수정하는 시스템이면서, 그 에이전트가 쓸 수 있는 툴, skill 등을 자유롭게 세팅하고 지정하거나 자동으로 돌리거나 하는 식으로 강화시키고, 모니터링도 되고 하면서 관리자가 있고 그냥 사용자가 있고, 이런 구조였다."
>
> "그 중에서 이제 에이전트를 통해 text to sql이라던지 자동 리서치 돌리기, 주기적으로 리서치 보고하기, 할일 관리 이런거 다 해주는거였고"

## 5. LLM Gateway 조사 결과 요약

| 서비스 | 판정 | 이유 |
|--------|------|------|
| LiteLLM | ❌ 금지 | CVE 9개 + 공급망 공격 |
| Bifrost | ⚠️ 보류 | 기술 좋지만 검증 안 됨 ($3M 시드, 사용자 0) |
| Portkey | ✅ 후보 | SOC2, 200+ 모델, 셀프호스팅 가능 (Enterprise) |
| Helicone | ✅ 후보 | OSS, SOC2, Rust, 셀프호스팅 무료 |
| Vercel AI Gateway | ✅ 후보 | OIDC, AI SDK 통합, 셀프호스팅 불가 |
| 직접 Provider | ✅ 채택 | 로컬: Claude 크레덴셜, 인프라: Bedrock |

**현재 전략**: 초기에는 직접 Provider (가장 단순). 나중에 필요하면 Portkey/AI Gateway 추가.

## 6. Montgomery에서 가져온 것

Montgomery(abot) 코드베이스에서 43개 아키텍처 패턴을 학습:
- Dual-Lambda, Registry Pattern, Credential Caching, Thread State
- 이모지 피드백, Prefix Routing, YAML Config, Structured Logging
- 상세: `docs/design/implementation/02-montgomery-patterns.md`

## 7. 설계 과정 통계

- 설계 라운드: **100+ 라운드** (기초 72 + 관리/운용 37+)
- 설계문서: **43파일, ~10,000줄**
- 스캐폴드 v1: **46파일, ~4,200줄**
- 분석 로그: **~11,500줄**
- 리서치 주제: 에이전트 생명주기, Router/Orchestrator, 프롬프트 관리, 평가 파이프라인, 보안, 비용 최적화, 한국어 NLU, MCP Server, Chat SDK, 멀티테넌시, Rate Limiting, 메모리 시스템, Admin 대시보드, 스케줄러, LLM Provider 등

## 8. 구현 시 참고할 핵심 설계 결정

| 결정 | 문서 | 핵심 |
|------|------|------|
| Agent > Skill > Tool 3계층 | `architecture/15-skill-tool-system.md` | 도구 재사용, 스킬 조합의 유연성 |
| Router → Orchestrator | `architecture/19-orchestrator-detail.md` | 모든 요청은 Router 거침, 복합은 Orchestrator |
| 3-Layer 프롬프트 | `architecture/07-prompt-engineering.md` | Static(캐싱) / Dynamic(요청별) / User(입력) |
| 로컬 Claude → 인프라 Bedrock | `architecture/18-llm-provider.md` | 환경 자동 감지, tier 기반 모델 선택 |
| 웹 대시보드 중심 관리 | `architecture/16-admin-interface.md` | 10개 페이지, 22개 Admin API |
| YAML 설정 15종 | `reference/03-config-schemas.md` | agents, skills, prompts, routing-rules 등 |
| Evaluation Pipeline | `capabilities/06-evaluation-observability.md` | Golden Dataset + LLM-as-judge + Drift Detection |
| 5-Layer Security | `architecture/08-security-access.md` | 인증 → RBAC → Guardrails → PII 마스킹 → Audit |
| 로컬 먼저 개발 | `implementation/03-roadmap.md` | Phase 0-1 로컬, Phase 2에서 첫 배포 |
