# Platform Philosophy & Agent Ecosystem

> Airflux Agent System은 SQL 봇이 아니라 **에이전트 플랫폼**이다

## 1. 핵심 원칙

```
이 프로젝트는 특정 기능을 하는 봇이 아니다.
자유롭게 에이전트를 만들고, 강화하고, 관리하고,
업무에 편하게 사용할 수 있는 플랫폼이다.
```

### SQL은 하나의 스킬일 뿐

```
Airflux Agent Platform
├── SQL Agent         ← 하나의 스킬 (dbt 연동)
├── Insight Agent     ← 하나의 스킬
├── Image Agent       ← 하나의 스킬
├── Jira Agent        ← 추가 가능
├── Slack Digest Agent ← 추가 가능
├── Onboarding Agent  ← 추가 가능
├── Alert Agent       ← 추가 가능
└── ... 무한 확장
```

## 2. 플랫폼이 제공하는 것

### 2.1 에이전트 개발자에게

| 제공 | 설명 |
|------|------|
| BaseAgent 클래스 | 공통 인터페이스 (execute, progress, error) |
| AgentRegistry | 코드 등록 + 설정 제어 |
| ResponseChannel | 출력 채널 추상화 (Slack, API, Cron 등) |
| Guardrails | 안전 검증 프레임워크 |
| Logger + Tracing | 구조화 로깅 + distributed tracing |
| 프롬프트 버전관리 | YAML 기반, 배포 없이 변경 |
| 평가 프레임워크 | Golden dataset + LLM-as-judge |
| Feature Flag | 점진적 롤아웃 |
| RBAC | 접근 제어 |

**새 에이전트를 만드는 데 필요한 코드**: agent.ts (50줄) + agents.yaml (10줄) + prompts.yaml (20줄)

### 2.2 사용자에게

| 제공 | 설명 |
|------|------|
| 자연어 인터페이스 | "~해줘"로 모든 에이전트 접근 |
| 멀티 엔드포인트 | Slack, API, Cron, MCP — 어디서든 |
| Router | 어떤 에이전트를 쓸지 자동 판단 |
| 대화형 | 후속 질문, 컨텍스트 유지 |
| 피드백 | 👍/👎로 품질 개선에 기여 |

### 2.3 운영자에게

| 제공 | 설명 |
|------|------|
| agents.yaml | 에이전트 활성화/모델/파라미터 런타임 제어 |
| 비용 추적 | 에이전트별/사용자별 비용 모니터링 |
| 평가 대시보드 | Golden dataset 점수, drift 감지 |
| 알림 | 이상 감지, 예산 초과, 품질 하락 |
| Audit Log | 모든 실행 이력 추적 |

## 3. dbt 연동 설계

SQL Agent는 **dbt가 관리하는 데이터 모델을 소비**한다.

```
dbt Project (별도 레포)
├── models/
│   ├── staging/         ← raw 데이터 정제
│   ├── intermediate/    ← 비즈니스 로직
│   └── marts/           ← 최종 분석 모델
├── metrics/             ← dbt Semantic Layer
│   ├── dau.yml
│   ├── revenue.yml
│   └── retention.yml
└── docs/
    └── catalog.json     ← dbt docs generate 산출물

     ↓ (동기화)

Airflux Agent Platform
├── settings/semantic-layer.yaml    ← dbt metrics에서 자동/반자동 생성
├── settings/domain-glossary.yaml   ← dbt descriptions에서 추출
└── src/agents/sql-agent/           ← dbt marts 테이블을 대상으로 SQL 생성
```

### dbt → Semantic Layer 동기화

```typescript
// dbt catalog.json → semantic-layer.yaml 변환
// Cron으로 주기적 실행 또는 dbt CI/CD 후 webhook 트리거

interface DbtCatalogNode {
  unique_id: string;         // model.airflux.daily_active_users
  name: string;              // daily_active_users
  description: string;       // "일별 활성 사용자 집계"
  columns: Record<string, { name: string; description: string; type: string }>;
  meta: Record<string, any>; // dbt meta 필드 (agent_visible, aliases 등)
}

async function syncDbtToSemanticLayer(catalogPath: string): Promise<void> {
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));

  const metrics: Record<string, any> = {};
  for (const [id, node] of Object.entries(catalog.nodes)) {
    // dbt meta에 agent_visible: true인 모델만
    if (!node.meta?.agent_visible) continue;

    metrics[node.name] = {
      name: node.description || node.name,
      aliases: node.meta?.aliases || [],
      table: `${node.schema}.${node.name}`,
      columns: Object.entries(node.columns).map(([name, col]) => ({
        name,
        type: col.type,
        description: col.description,
      })),
      dimensions: node.meta?.dimensions || [],
      timeGrain: node.meta?.time_grain || 'daily',
    };
  }

  // YAML로 저장 (수동 검토 후 배포)
  const yaml = stringifyYaml({ version: new Date().toISOString(), metrics });
  fs.writeFileSync('settings/semantic-layer.yaml', yaml);
}
```

### dbt meta 활용

dbt 모델에 에이전트 관련 메타데이터 추가:

```yaml
# dbt models/marts/daily_active_users.yml
models:
  - name: daily_active_users
    description: "일별 활성 사용자 집계"
    meta:
      agent_visible: true          # 에이전트가 이 모델을 사용 가능
      aliases: ["DAU", "일일활성사용자", "하루사용자"]
      dimensions: ["app_id", "platform", "country"]
      time_grain: daily
      default_time_range: 7d
    columns:
      - name: app_id
        description: "앱 ID"
      - name: dt
        description: "날짜"
      - name: dau
        description: "일일 활성 사용자 수"
```

## 4. 플러그인 아키텍처 (외부 서비스 연동)

에이전트가 외부 서비스와 쉽게 연동하는 구조:

```typescript
// 플러그인 = Tool 집합
interface AgentPlugin {
  name: string;
  description: string;
  tools: Record<string, AgentTool>;
  setup?: () => Promise<void>;    // 초기화 (OAuth 등)
}

// 예: Jira 플러그인
const jiraPlugin: AgentPlugin = {
  name: 'jira',
  description: 'Jira 이슈 조회/생성/업데이트',
  tools: {
    searchIssues: {
      description: 'JQL로 이슈 검색',
      inputSchema: z.object({ jql: z.string() }),
      execute: async ({ jql }) => jiraClient.search(jql),
    },
    createIssue: {
      description: '새 이슈 생성',
      inputSchema: z.object({
        project: z.string(),
        summary: z.string(),
        description: z.string(),
        type: z.enum(['Bug', 'Task', 'Story']),
      }),
      execute: async (input) => jiraClient.createIssue(input),
    },
    getIssue: {
      description: '이슈 상세 조회',
      inputSchema: z.object({ issueKey: z.string() }),
      execute: async ({ issueKey }) => jiraClient.getIssue(issueKey),
    },
  },
};

// 플러그인 등록 → 에이전트가 도구로 사용
class PluginRegistry {
  private static plugins = new Map<string, AgentPlugin>();

  static register(plugin: AgentPlugin): void {
    this.plugins.set(plugin.name, plugin);
  }

  // 특정 에이전트에 플러그인 도구 주입
  static getToolsForAgent(agentName: string): Record<string, AgentTool> {
    const config = loadConfig('agent-plugins');
    const allowedPlugins = config[agentName] || [];

    const tools: Record<string, AgentTool> = {};
    for (const pluginName of allowedPlugins) {
      const plugin = this.plugins.get(pluginName);
      if (plugin) {
        for (const [toolName, tool] of Object.entries(plugin.tools)) {
          tools[`${pluginName}_${toolName}`] = tool;
        }
      }
    }
    return tools;
  }
}
```

### 플러그인 설정

```yaml
# settings/agent-plugins.yaml
# 어떤 에이전트가 어떤 플러그인을 사용할 수 있는지
task-agent:
  - jira
  - confluence
  - github

insight-agent:
  - dbt         # dbt 메타데이터 직접 조회

onboarding-agent:
  - jira
  - slack       # 채널 생성, 멤버 초대
```

### 잠재적 플러그인 목록

| 플러그인 | 도구 | 용도 |
|---------|------|------|
| jira | 이슈 검색/생성/업데이트 | 작업 관리 자동화 |
| confluence | 페이지 조회/생성 | 문서 자동화 |
| github | PR/이슈/릴리즈 조회 | 코드 관련 작업 |
| notion | 페이지 조회/생성 | 문서 관리 |
| slack | 채널 관리/메시지 검색 | Slack 자동화 |
| dbt | 모델/메트릭 조회 | 데이터 카탈로그 |
| newrelic | 에러/성능 조회 | 모니터링 |
| pagerduty | 인시던트 조회/생성 | 온콜 관리 |

## 5. 에이전트 스킬 카탈로그 (사용자 발견)

사용자가 "이 에이전트로 뭘 할 수 있지?"를 발견:

```
/airflux help

🤖 Airflux Agent — 사용 가능한 기능

📊 데이터 조회
  "앱 123의 DAU", "이벤트 수 알려줘"
  → SQL Agent (dbt 모델 기반)

💡 인사이트
  "왜 이벤트가 줄었어?", "이상한 앱 찾아줘"
  → Insight Agent

📈 시각화
  "차트로 보여줘", "추이 그래프"
  → Image Agent

📋 작업 관리
  "Jira 이슈 만들어줘", "이번 스프린트 이슈 목록"
  → Task Agent + Jira 플러그인

📥 Export
  "CSV로 다운로드", "리포트 생성"
  → Export 기능

🔍 디버그
  "debug: [질문]" → 내부 동작 상세 표시
  "explain: [질문]" → 간단한 설명
  "/airflux status" → 시스템 상태

💡 Tip: 자연어로 질문하면 자동으로 적절한 에이전트가 선택됩니다.
```

```typescript
// 카탈로그 자동 생성 (AgentRegistry에서)
async function generateCatalog(): Promise<string> {
  const agents = await AgentRegistry.getAll();
  return agents
    .filter(a => a.capability)
    .map(a => {
      const emoji = AGENT_EMOJIS[a.name] || '🤖';
      return `${emoji} *${a.capability.description}*\n` +
        a.capability.examples.map(e => `  "${e}"`).join('\n') +
        `\n  → ${a.name} Agent`;
    })
    .join('\n\n');
}
```

## 6. 플랫폼 성장 경로

```
Phase 0-1: SQL Agent + 기본 플랫폼
  → "데이터 조회 봇"으로 시작, 플랫폼 기반 다지기

Phase 2: Insight + Image + 피드백
  → "데이터 분석 에이전트"로 성장

Phase 3: 연구 자동화 + 외부 플러그인
  → "업무 자동화 플랫폼"으로 확장
  → Jira, Confluence, GitHub 연동
  → 사내 누구나 에이전트 추가 가능

Phase 4+: Chat SDK + MCP
  → "사내 AI 허브"로 진화
  → 모든 팀이 자기 에이전트를 만들어 등록
```

## 7. 설계 결정 이유

| 결정 | 이유 |
|------|------|
| SQL Agent를 특별 취급하지 않음 | 플랫폼의 하나의 스킬일 뿐 — 다른 에이전트와 동일한 인터페이스 |
| dbt 연동은 동기화 방식 | dbt가 데이터 레이어 주인 — Agent는 소비자 |
| 플러그인 아키텍처 | 외부 서비스마다 에이전트를 만들지 않음 — 도구를 공유 |
| agent-plugins.yaml | 어떤 에이전트가 어떤 플러그인을 쓸 수 있는지 선언적 관리 |
| 카탈로그 자동 생성 | AgentRegistry에서 capability를 읽어 자동 구성 — 수동 유지 불필요 |
