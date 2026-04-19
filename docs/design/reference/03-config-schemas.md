# Configuration Schemas Reference

> 모든 YAML 설정 파일의 스키마, 목적, 예시

## Schema Index (Status as of 2026-04-18)

| Schema | File | Status |
|--------|------|--------|
| agents | `settings/agents.yaml` | IMPLEMENTED |
| skills | `settings/skills.yaml` | IMPLEMENTED |
| routing-rules | `settings/routing-rules.yaml` | IMPLEMENTED |
| feature-flags | `settings/feature-flags.yaml` | IMPLEMENTED |
| mcp-servers | `settings/mcp-servers.yaml` | IMPLEMENTED |
| semantic-layer | `settings/semantic-layer.yaml` | IMPLEMENTED |
| domain-glossary | `settings/domain-glossary.yaml` | IMPLEMENTED |
| prompts (instructions) | `settings/instructions/*.md` (+ DB) | REPLACED — markdown per-agent + `prompt-store.ts` for versions |
| rate-limits | code-only | REPLACED — `packages/server/src/middleware/rate-limit.ts` |
| rbac | `settings/rbac.yaml` | PLANNED — Epic 5 of current plan |
| golden-dataset | `settings/golden-dataset.json` | PLANNED — Epic 4 of current plan |
| experiments | — | ARCHIVED — no runner, no YAML |
| monitors | — | ARCHIVED — no alarm engine |
| cron-reports | — | ARCHIVED — scheduler heartbeat FROZEN, see `docs/FROZEN.md` |
| few-shots | — | ARCHIVED — no loader, no YAML |
| channel-app-mapping | — | ARCHIVED — Slack multi-tenancy deferred |
| app-access | — | ARCHIVED — deferred to RBAC rework |

**Status meanings**:
- **IMPLEMENTED**: YAML file exists AND a loader reads it at startup (verified via `loadConfigOptional` calls).
- **PLANNED**: referenced by an active plan under `docs/superpowers/plans/` or the current improvement plan.
- **ARCHIVED**: removed from active scope; schema below is retained for historical reference until moved to `docs/design/archive/`.
- **REPLACED**: superseded by a different mechanism (code path noted).

The detailed schema sections below are authoritative only for rows marked
IMPLEMENTED or PLANNED. For ARCHIVED/REPLACED rows, treat the sections as
historical reference only.

---

## 설정 파일 전체 목록

```
settings/
├── agents.yaml                ← 에이전트 등록 + 런타임 파라미터
├── routing-rules.yaml         ← Router Agent 라우팅 규칙
├── semantic-layer.yaml        ← 테이블/메트릭/컬럼 매핑
├── domain-glossary.yaml       ← 도메인 용어 사전
├── feature-flags.yaml         ← 기능 활성화 플래그
├── rbac.yaml                  ← 역할 기반 접근 제어
├── experiments.yaml           ← A/B 테스트 설정
├── monitors.yaml              ← 임계값 모니터링 규칙
├── cron-reports.yaml          ← 스케줄 리포트 정의
├── rate-limits.yaml           ← Rate limit + 동시성 제한
├── channel-app-mapping.yaml   ← Slack 채널 → 앱 ID 매핑
├── app-access.yaml            ← 사용자별 앱 접근 권한
├── prompts/
│   ├── router-agent.yaml      ← Router 프롬프트 버전
│   ├── sql-agent.yaml         ← SQL Agent 프롬프트 버전
│   ├── insight-agent.yaml     ← Insight Agent 프롬프트 버전
│   └── image-agent.yaml       ← Image Agent 프롬프트 버전
├── few-shots/
│   ├── routing.yaml           ← Router few-shot 예시
│   └── sql.yaml               ← SQL 생성 few-shot 예시
└── golden-dataset.json        ← 평가용 golden query 셋
```

---

## 1. agents.yaml

에이전트 등록 및 런타임 파라미터.

```yaml
# Schema
- name: string                      # 에이전트 이름 (registry key)
  enabled: boolean                  # 활성화 여부
  model: string                     # AI Gateway 모델 (e.g. 'anthropic/claude-sonnet-4.6')
  fallbackModel?: string            # 장애 시 대체 모델
  maxSteps: number                  # Agent 최대 step 수
  temperature: number               # LLM temperature (0-1)
  costLimitPerRequest: number       # 요청당 비용 한도 (USD)
  dailyBudget: number              # 일일 비용 한도 (USD)
  promptVersion: string            # 프롬프트 버전 (e.g. 'v2.1')
  allowedSources: string[]         # 허용 엔드포인트 ['slack','api','cron','webhook']
  featureFlag?: string             # 연동할 feature flag 이름
```

**로딩**: `AgentRegistry.initialize()` → 활성화된 에이전트만 동적 import + 설정 주입.
**캐싱**: 5분 TTL (config-loader).
**변경 시**: 코드 배포 불필요. Lambda cold start 또는 5분 캐시 만료 후 적용.

---

## 2. routing-rules.yaml

Router Agent의 의도 분류 규칙.

```yaml
# Schema
agents:
  <agent_name>:
    description: string            # 에이전트 역할 설명 (Router 프롬프트에 주입)
    keywords: string[]             # 매칭 키워드 (한국어/영어)
    examples:                      # 예시 질문 → 라우팅 결과
      - question: string
        route: string | string[]   # 단일 또는 복합 에이전트
    priority?: number              # 동점 시 우선순위 (높을수록 우선)

fallback:
  agent: string                    # 매칭 실패 시 기본 에이전트
  clarificationThreshold: number   # 이 confidence 이하면 사용자에게 확인
```

**주입 위치**: Router Agent system prompt의 `{routing_rules}` 플레이스홀더.

---

## 3. semantic-layer.yaml

SQL Agent가 참조하는 테이블/메트릭 매핑.

```yaml
# Schema
version: string                    # e.g. '2026.04.02'
changelog:
  - version: string
    changes: string[]

metrics:
  <metric_key>:
    name: string                   # 표시 이름
    aliases: string[]              # 한국어/영어/약어 별칭
    sql: string                    # SQL 표현식 (e.g. 'COUNT(DISTINCT user_id)')
    table: string                  # schema.table
    preAggregatedColumn?: string   # 사전 집계 컬럼 (있으면 직접 사용)
    timeGrain: string              # 'daily' | 'hourly' | 'monthly'
    dimensions: string[]           # GROUP BY 가능 컬럼
    defaultTimeRange?: string      # '7d' | '30d' 등
    currency?: string              # 화폐 단위 (해당 시)

appAliases:                        # 앱 이름 → subdomain 매핑
  <display_name>: string
```

**주입 위치**: SQL Agent system prompt의 `{semantic_layer}` — relevance filtering 후 관련 metric만.
**버전 관리**: changelog로 변경 이력 추적.

---

## 4. domain-glossary.yaml

도메인 용어 사전 (한국어 ↔ 영어).

```yaml
# Schema
terms:
  - term: string                   # 대표 용어
    aliases: string[]              # 동의어/약어
    definition: string             # 정의 (한국어)
    table?: string                 # 관련 테이블
    column?: string                # 관련 컬럼
    tables?: string[]              # 여러 테이블에 걸친 경우
    commonValues?: Record<string, string>  # 코드값 → 의미 매핑
    filter?: string                # 일반적인 필터 조건
```

**주입 위치**: SQL Agent system prompt의 `{domain_glossary}` — 상위 10개.

---

## 5. feature-flags.yaml

기능 플래그 (에이전트 활성화, 실험 기능).

```yaml
# Schema
<flag_name>:
  description: string
  enabled: boolean                 # 전체 활성화/비활성화
  rolloutPercentage: number        # 0-100 (부분 롤아웃)
  allowedUsers?: string[]          # 특정 사용자만 허용
```

**사용**: `isFeatureEnabled(flagName, userId)` — 해시 기반 결정적 롤아웃.

---

## 6. rbac.yaml

> **PLANNED**: schema is aspirational. The in-code `rbac` middleware at
> `packages/server/src/middleware/rbac.ts` exists but is driven by runtime
> role, not YAML. A YAML-driven version is a follow-up once multi-tenant
> requirements are concrete.

역할 기반 접근 제어.

```yaml
# Schema
roles:
  <role_name>:
    description: string
    agents: string[]               # 접근 가능 에이전트
    dataSources: string[]          # 접근 가능 데이터소스
    maxDailyQueries: number | 'unlimited'
    canAccessPII: boolean          # 항상 false (설계 원칙)
    canExport: boolean
    canRunCron: boolean

users:
  <userId_or_@group>: string       # → role 이름
  default: string                  # 기본 역할
```

---

## 7. experiments.yaml

> **ARCHIVED 2026-04-18**: no runner implementation, no YAML file in
> `settings/`. Kept for historical reference.

A/B 테스트 설정.

```yaml
# Schema
- name: string                     # 실험 이름
  enabled: boolean
  variants:
    <variant_name>:
      model: string                # AI Gateway 모델
      promptVersion: string        # 프롬프트 버전
      weight: number               # 트래픽 비율 (합계 100)
  metrics: string[]                # 추적 지표
  startDate: string                # ISO date
  endDate: string                  # ISO date
```

---

## 8. monitors.yaml

> **ARCHIVED 2026-04-18**: no alarm engine implementation. Kept for
> historical reference.

임계값 기반 자동 모니터링.

```yaml
# Schema
monitors:
  - name: string
    schedule: string               # Cron 표현식
    query: string                  # SQL 쿼리
    threshold:
      type: string                 # 'drop_percent' | 'absolute' | 'spike_percent'
      baseline: string             # '24h_avg' | '7d_avg' | 'fixed'
      value: number                # 임계값
    alert:
      channel: string              # Slack 채널
      mention?: string             # @그룹 멘션
```

---

## 9. cron-reports.yaml

> **ARCHIVED 2026-04-18**: scheduler autonomous heartbeat is FROZEN (see
> `docs/FROZEN.md`). Kept for historical reference.

스케줄 리포트.

```yaml
# Schema
<report_name>:
  schedule: string                 # Cron 표현식
  query: string                    # 자연어 질문 (에이전트에 전달)
  agents: string[]                 # 사용할 에이전트
  channels:
    - type: string                 # 'slack' | 's3'
      channel?: string             # Slack 채널 ID
      path?: string                # S3 경로 prefix
```

---

## 10. prompts/<agent>.yaml

> **REPLACED 2026-04-18**: system prompts are now markdown files under
> `settings/instructions/<agent>.md`. Version history lives in
> `packages/server/src/store/prompt-store.ts` (SQLite, backed by the
> `prompt_versions` table). The YAML design below is historical.

프롬프트 버전 관리.

```yaml
# Schema
versions:
  <version_tag>:                   # e.g. 'v2.1'
    system: string                 # 시스템 프롬프트 (멀티라인)
    current?: boolean              # 현재 활성 버전 표시
    deprecated?: boolean           # 폐기 표시
    changelog?: string             # 변경 사항
```

**플레이스홀더**: `{semantic_layer}`, `{domain_glossary}`, `{few_shot_examples}`, `{session_history}`, `{previous_step_results}`, `{agent_descriptions}`, `{routing_rules}`

---

## 11. few-shots/<domain>.yaml

> **ARCHIVED 2026-04-18**: no loader, no files under `settings/few-shots/`.
> Few-shot examples today live inline in the agent instructions.

검증된 few-shot 예시.

```yaml
# Schema
examples:
  - question: string               # 사용자 질문
    route?: string | string[]      # 라우팅 결과 (routing.yaml용)
    sql?: string                   # 생성 SQL (sql.yaml용)
    verified: boolean              # 수동 검증 완료 여부
    source: string                 # 'manual' | 'user_feedback' | 'auto'
    added: string                  # ISO date
```

---

## 12. rate-limits.yaml

> **REPLACED 2026-04-18**: rate limiting is implemented in code at
> `packages/server/src/middleware/rate-limit.ts` (in-memory sliding
> window, applied per route in `app.ts`). A YAML-driven configuration is
> not currently loaded.

Rate limit + 동시성 제한. 상세: `architecture/12-rate-limiting.md`

```yaml
# Schema
endpoints:
  <endpoint>:
    requestsPerMinute: number
    concurrentPerUser: number
agents:
  <agent>: { maxConcurrent: number }
global:
  maxConcurrentTotal: number
  dailyBudgetHardCap: number     # USD
  queueMaxSize: number
  queueItemTimeout: number       # 초
```

---

## 13. channel-app-mapping.yaml

> **ARCHIVED 2026-04-18**: Slack multi-tenancy is deferred. The current
> Slack route uses a single app context; this YAML has no loader.

Slack 채널 → 앱 매핑. 상세: `architecture/11-multi-tenancy.md`

```yaml
# Schema
channels:
  <channel_id>:
    appId: number
    appName: string
```

---

## 14. app-access.yaml

> **ARCHIVED 2026-04-18**: deferred to the future RBAC rework (see
> `## 6. rbac.yaml` for the planned direction).

사용자별 앱 접근 권한 (RBAC 확장).

```yaml
# Schema
- userId: string
  allowedAppIds: number[] | 'all'
```

---

## 설정 로딩 & 캐싱 규칙

| 파일 | 로딩 시점 | 캐시 TTL | 변경 시 영향 |
|------|----------|---------|-------------|
| agents.yaml | AgentRegistry.initialize() | 5분 | 에이전트 활성화/모델/파라미터 |
| routing-rules.yaml | Router prompt 빌드 시 | 5분 | 라우팅 정확도 |
| semantic-layer.yaml | SQL Agent prompt 빌드 시 | 5분 | SQL 생성 정확도 |
| domain-glossary.yaml | SQL Agent prompt 빌드 시 | 5분 | 용어 이해도 |
| feature-flags.yaml | isFeatureEnabled() 호출 시 | 5분 | 기능 접근 |
| rbac.yaml | checkAccess() 호출 시 | 5분 | 접근 권한 |
| experiments.yaml | selectVariant() 호출 시 | 5분 | A/B 트래픽 할당 |
| prompts/*.yaml | 에이전트 실행 시 | 5분 + LLM 캐시 5분 | 프롬프트 내용 |
| few-shots/*.yaml | prompt 빌드 시 | 5분 | few-shot 예시 |
| golden-dataset.json | 평가 실행 시 | 캐시 없음 | 평가 기준 |
| monitors.yaml | Cron 실행 시 | 캐시 없음 | 모니터링 규칙 |
| cron-reports.yaml | Cron 실행 시 | 캐시 없음 | 리포트 스케줄 |
| rate-limits.yaml | checkRateLimit() 호출 시 | 5분 | 요청/동시성 제한 |
| channel-app-mapping.yaml | resolveAppContext() 호출 시 | 5분 | 채널→앱 매핑 |
| app-access.yaml | checkAppAccess() 호출 시 | 5분 | 앱 접근 권한 |

모든 YAML은 `loadConfig<T>(name)` 으로 로드. 5분 TTL in-memory 캐시.
총 **15종** 설정 파일.
`copyFiles` SST 설정으로 Lambda에 번들됨.
