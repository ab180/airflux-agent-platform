# Dashboard Data Model & Storage

> 대시보드가 읽고 쓰는 데이터의 저장소와 스키마

## 1. 저장소 전략

웹 대시보드가 관리하는 데이터는 3가지 저장소에 분산:

```
┌──────────────────────────────────────────────────┐
│  PostgreSQL (Neon)                                │
│  = 구조화된 관리 데이터 (Source of Truth)          │
│  - 에이전트 설정                                  │
│  - 스킬/도구 매핑                                 │
│  - 프롬프트 버전                                  │
│  - Golden Dataset                                │
│  - 스케줄 정의                                    │
│  - 사용자/역할                                    │
│  - 평가 결과 (시계열)                              │
│  - 피드백 레코드                                  │
├──────────────────────────────────────────────────┤
│  Redis (Upstash)                                  │
│  = 런타임 상태 (실시간)                            │
│  - 세션/메모리 (Tier 1-2)                         │
│  - 임시 오버라이드                                │
│  - Rate limit 카운터                              │
│  - 동시성 세마포어                                │
├──────────────────────────────────────────────────┤
│  S3                                               │
│  = 대용량/비구조화                                 │
│  - Audit 로그 (장기)                              │
│  - Export 파일                                    │
│  - 리포트 HTML                                    │
│  - 차트 이미지                                    │
└──────────────────────────────────────────────────┘
```

### 왜 PostgreSQL 추가?

기존 설계는 YAML + Redis였는데, 웹 대시보드에서 CRUD하려면:
- YAML: 파일 시스템 수정 → git push 필요 → 웹에서 직접 수정 어려움
- Redis: TTL 기반 → 영구 데이터에 부적합
- **PostgreSQL**: CRUD 자연스러움, 이력 관리, 대시보드 API에 최적

```
기존: YAML (Lambda 번들) → 에이전트 런타임이 직접 읽음
변경: PostgreSQL (대시보드 Source of Truth) → 에이전트 런타임이 API 또는 캐시로 읽음
```

## 2. 데이터 모델

### 2.1 에이전트 설정

```sql
CREATE TABLE agents (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  enabled BOOLEAN DEFAULT true,
  model VARCHAR(200) NOT NULL,
  fallback_model VARCHAR(200),
  max_steps INTEGER DEFAULT 5,
  temperature NUMERIC(3,2) DEFAULT 0,
  cost_limit_per_request NUMERIC(10,4),
  daily_budget NUMERIC(10,2),
  prompt_version VARCHAR(20),
  allowed_sources TEXT[],       -- '{slack,api,cron,webhook}'
  feature_flag VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.2 스킬 & 도구

```sql
CREATE TABLE skills (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  required_tools TEXT[],       -- '{executeSnowflakeQuery,getSemanticLayer}'
  guardrails TEXT[],           -- '{read-only,pii-filter}'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE agent_skills (
  agent_id INTEGER REFERENCES agents(id),
  skill_id INTEGER REFERENCES skills(id),
  PRIMARY KEY (agent_id, skill_id)
);

CREATE TABLE agent_extra_tools (
  agent_id INTEGER REFERENCES agents(id),
  tool_name VARCHAR(100),
  PRIMARY KEY (agent_id, tool_name)
);
```

### 2.3 프롬프트 버전

```sql
CREATE TABLE prompt_versions (
  id SERIAL PRIMARY KEY,
  agent_name VARCHAR(100) NOT NULL,
  version VARCHAR(20) NOT NULL,
  system_prompt TEXT NOT NULL,
  is_current BOOLEAN DEFAULT false,
  is_deprecated BOOLEAN DEFAULT false,
  changelog TEXT,
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (agent_name, version)
);
```

### 2.4 스케줄

```sql
CREATE TABLE schedules (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  agent_name VARCHAR(100) REFERENCES agents(name),
  cron_expression VARCHAR(100) NOT NULL,
  question TEXT NOT NULL,
  channels TEXT[],             -- '{#airflux-alerts}'
  enabled BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_run_status VARCHAR(20), -- 'success' | 'error'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.5 Golden Dataset

```sql
CREATE TABLE golden_dataset (
  id VARCHAR(20) PRIMARY KEY,  -- 'GD-001'
  category VARCHAR(50) NOT NULL,
  difficulty VARCHAR(10) NOT NULL,
  question TEXT NOT NULL,
  expected_route TEXT,
  expected_sql_pattern TEXT,
  expected_columns TEXT[],
  expected_guardrail VARCHAR(50),
  expected_behavior VARCHAR(50),
  quality_rubric TEXT,
  tags TEXT[],
  source VARCHAR(20) DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_verified TIMESTAMPTZ
);
```

### 2.6 평가 결과

```sql
CREATE TABLE eval_runs (
  id SERIAL PRIMARY KEY,
  trigger VARCHAR(20) NOT NULL,  -- 'cron' | 'deploy' | 'manual'
  overall_score NUMERIC(5,2),
  total_cases INTEGER,
  passed INTEGER,
  failed INTEGER,
  total_cost NUMERIC(10,4),
  total_latency_ms INTEGER,
  run_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE eval_results (
  id SERIAL PRIMARY KEY,
  run_id INTEGER REFERENCES eval_runs(id),
  test_id VARCHAR(20) REFERENCES golden_dataset(id),
  routing_correct BOOLEAN,
  sql_match VARCHAR(20),        -- 'exact' | 'structural' | 'wrong'
  guardrail_triggered VARCHAR(50),
  quality_score NUMERIC(3,1),
  latency_ms INTEGER,
  cost_usd NUMERIC(10,4),
  model VARCHAR(200),
  prompt_version VARCHAR(20)
);
```

### 2.7 피드백

```sql
CREATE TABLE feedback (
  id SERIAL PRIMARY KEY,
  query_id VARCHAR(100) NOT NULL,
  user_id VARCHAR(100) NOT NULL,
  rating VARCHAR(20) NOT NULL,   -- 'positive' | 'negative'
  detailed_feedback TEXT,
  original_question TEXT,
  router_decision VARCHAR(100),
  agents_used TEXT[],
  generated_sql TEXT,
  model VARCHAR(200),
  prompt_version VARCHAR(20),
  experiment_variant VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.8 사용자/역할

```sql
CREATE TABLE users (
  id VARCHAR(100) PRIMARY KEY,  -- Slack user ID
  email VARCHAR(200),
  role VARCHAR(20) DEFAULT 'viewer',
  allowed_app_ids INTEGER[],    -- NULL = 전체 접근
  daily_query_limit INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_active TIMESTAMPTZ
);
```

## 3. 에이전트 런타임 ↔ DB 동기화

에이전트 런타임(Lambda)이 매 요청마다 DB를 조회하면 느림. **캐시 전략**:

```typescript
// 에이전트 설정: Redis 캐시 (5분 TTL)
async function getAgentConfig(name: string): Promise<AgentConfig> {
  const cacheKey = `config:agent:${name}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // DB에서 조회
  const config = await db.query('SELECT * FROM agents WHERE name = $1', [name]);
  const skills = await db.query(
    'SELECT s.* FROM skills s JOIN agent_skills as2 ON s.id = as2.skill_id WHERE as2.agent_id = $1',
    [config.id]
  );

  const result = { ...config, skills: skills.map(s => s.name) };
  await redis.set(cacheKey, JSON.stringify(result), { ex: 300 }); // 5분
  return result;
}

// 대시보드에서 설정 변경 시 → 캐시 무효화
async function invalidateAgentCache(name: string): Promise<void> {
  await redis.del(`config:agent:${name}`);
}
```

### 즉시 반영 vs 지연 반영

| 변경 | 반영 시점 | 방법 |
|------|----------|------|
| 에이전트 활성화/비활성화 | **즉시** | Redis 캐시 무효화 |
| 모델 변경 | **즉시** | Redis 캐시 무효화 |
| 프롬프트 변경 | **즉시** | Redis 캐시 무효화 + LLM 캐시 자연 만료 (5분) |
| 스킬 추가/제거 | **즉시** | Redis 캐시 무효화 |
| 새 에이전트 추가 | **배포 후** | 코드 필요 (AgentRegistry에 import) |
| 새 도구 추가 | **배포 후** | 코드 필요 (ToolRegistry에 등록) |

## 4. 마이그레이션: YAML → DB

기존 YAML 설정을 DB 초기 데이터로 import:

```typescript
// 1회성 마이그레이션 스크립트
async function migrateYamlToDb(): Promise<void> {
  // agents.yaml → agents 테이블
  const agents = loadYaml('agents');
  for (const agent of agents) {
    await db.query('INSERT INTO agents (name, enabled, model, ...) VALUES ($1, $2, $3, ...)', [...]);
  }

  // prompts/*.yaml → prompt_versions 테이블
  // skills.yaml → skills 테이블
  // golden-dataset.json → golden_dataset 테이블
  // ...
}
```

마이그레이션 후에도 YAML은 **bootstrap/seed 데이터**로 유지 (새 환경 셋업 시).

## 5. 설계 결정 이유

| 결정 | 이유 |
|------|------|
| PostgreSQL 추가 | 웹 CRUD에 YAML 파일 수정은 부적합 — DB가 자연스러움 |
| Neon (Serverless Postgres) | Lambda 환경에 적합, 연결 풀링 내장, Vercel 통합 |
| Redis 캐시 5분 | DB 직접 조회 회피 + 설정 변경 시 즉시 무효화 가능 |
| 새 에이전트/도구는 여전히 코드 | 외부 라이브러리, 복잡한 로직 — DB만으로 불가 |
| YAML은 seed로 유지 | 새 환경 셋업, 테스트, 로컬 개발에 여전히 유용 |
