# Skill & Tool Registration System

> 에이전트가 사용하는 스킬과 도구의 정의, 등록, 관리

## 1. 개념 구분

```
Agent (에이전트)
  = 특정 목적을 가진 AI 개체
  = LLM + Instructions + Skills + Tools
  예: Data Agent, Research Agent, Task Agent

Skill (스킬)
  = 에이전트가 수행하는 고수준 능력
  = 하나 이상의 도구를 조합한 워크플로우
  예: text-to-sql, anomaly-detect, jira-create-issue

Tool (도구)
  = 외부 시스템과 상호작용하는 단일 함수
  = AI SDK 6 tool 정의 (inputSchema + execute)
  예: executeSnowflakeQuery, searchJiraIssues, postSlackMessage
```

### 관계

```
Agent "Data Agent"
├── Skill: text-to-sql
│   ├── Tool: getSemanticLayer
│   ├── Tool: executeSnowflakeQuery
│   └── Tool: formatResult
├── Skill: chart-generation
│   ├── Tool: generateQuickChart
│   └── Tool: uploadToS3
└── Skill: data-export
    ├── Tool: executeSnowflakeQuery (공유)
    └── Tool: generatePresignedUrl
```

## 2. Tool Registry

도구는 코드로 정의하고, 여러 에이전트/스킬이 공유:

```typescript
// src/tools/registry.ts
class ToolRegistry {
  private static tools = new Map<string, AgentTool>();

  static register(name: string, tool: AgentTool): void {
    this.tools.set(name, tool);
  }

  static get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  // 여러 도구를 이름으로 가져오기
  static getMany(names: string[]): Record<string, AgentTool> {
    const result: Record<string, AgentTool> = {};
    for (const name of names) {
      const tool = this.tools.get(name);
      if (tool) result[name] = tool;
    }
    return result;
  }

  static list(): string[] {
    return Array.from(this.tools.keys());
  }
}
```

### 도구 정의 예시

```typescript
// src/tools/snowflake.ts
ToolRegistry.register('executeSnowflakeQuery', {
  description: 'Snowflake SQL 실행 (READ-ONLY)',
  inputSchema: z.object({
    sql: z.string(),
    timeout: z.number().optional().default(30000),
  }),
  execute: async ({ sql, timeout }) => {
    const guardrailResult = runGuardrails(sql, context);
    if (!guardrailResult.pass) return { error: guardrailResult.reason };
    return await snowflake.execute(sql, { timeout });
  },
});

// src/tools/jira.ts
ToolRegistry.register('searchJiraIssues', {
  description: 'JQL로 Jira 이슈 검색',
  inputSchema: z.object({ jql: z.string(), maxResults: z.number().default(10) }),
  execute: async ({ jql, maxResults }) => jiraClient.search(jql, maxResults),
});

ToolRegistry.register('createJiraIssue', {
  description: '새 Jira 이슈 생성',
  inputSchema: z.object({
    project: z.string(),
    summary: z.string(),
    description: z.string().optional(),
    type: z.enum(['Bug', 'Task', 'Story']),
    assignee: z.string().optional(),
  }),
  execute: async (input) => jiraClient.createIssue(input),
});

// src/tools/slack.ts
ToolRegistry.register('postSlackMessage', {
  description: 'Slack 채널에 메시지 전송',
  inputSchema: z.object({
    channel: z.string(),
    text: z.string(),
    threadTs: z.string().optional(),
  }),
  execute: async ({ channel, text, threadTs }) => {
    return await slack.chat.postMessage({ channel, text, thread_ts: threadTs });
  },
});
```

## 3. 에이전트 → 스킬 → 도구 설정

```yaml
# settings/agents.yaml (확장)
- name: data-agent
  enabled: true
  model: anthropic/claude-sonnet-4.6
  promptVersion: v1.0
  skills:                          # 이 에이전트가 사용하는 스킬
    - text-to-sql
    - chart-generation
    - data-export
  tools:                           # 스킬 외 추가 도구 (직접 지정)
    - getSemanticLayer
    - getDomainGlossary

- name: task-agent
  enabled: true
  model: anthropic/claude-sonnet-4.6
  promptVersion: v1.0
  skills:
    - todo-manage
    - jira-integration
  tools:
    - searchJiraIssues
    - createJiraIssue
    - postSlackMessage

- name: research-agent
  enabled: true
  model: anthropic/claude-sonnet-4.6
  promptVersion: v1.0
  skills:
    - anomaly-detect
    - trend-analysis
    - periodic-report
  tools:
    - executeSnowflakeQuery
    - generateQuickChart
    - postSlackMessage
    - uploadToS3
  schedule:                        # 자동 실행 스케줄
    - name: "일일 이상치 리포트"
      cron: "0 9 * * *"
      question: "지난 24시간 주요 앱 이상치 분석"
      channels: ["#airflux-alerts"]
    - name: "주간 요약"
      cron: "0 10 * * 1"
      question: "지난 주 주요 지표 요약 및 전주 대비 변화"
      channels: ["#airflux-weekly"]
```

## 4. Skill 정의

스킬은 도구 조합 + 실행 로직:

```yaml
# settings/skills.yaml
skills:
  text-to-sql:
    description: "자연어를 SQL로 변환하여 Snowflake에서 실행"
    requiredTools: [getSemanticLayer, executeSnowflakeQuery, formatResult]
    guardrails: [read-only, time-range, row-limit, pii-filter, cost-estimation]

  anomaly-detect:
    description: "시계열 데이터에서 통계적 이상치 탐지"
    requiredTools: [executeSnowflakeQuery, detectAnomalies]
    guardrails: [read-only, time-range]

  jira-integration:
    description: "Jira 이슈 조회/생성/업데이트"
    requiredTools: [searchJiraIssues, createJiraIssue, updateJiraIssue]
    guardrails: []    # Jira는 SQL guardrail 불필요

  periodic-report:
    description: "정기 리포트 생성 및 전달"
    requiredTools: [executeSnowflakeQuery, generateQuickChart, uploadToS3, postSlackMessage]
    guardrails: [read-only, cost-estimation]

  todo-manage:
    description: "할 일 관리 (생성, 조회, 완료 처리)"
    requiredTools: [searchJiraIssues, createJiraIssue, postSlackMessage]
    guardrails: []
```

## 5. 에이전트 초기화 시 도구 주입

```typescript
// AgentRegistry.initialize() 확장
static async initialize() {
  const agentConfigs = await loadConfig<AgentConfig[]>('agents');
  const skillDefs = await loadConfig('skills');

  for (const config of agentConfigs) {
    if (!config.enabled) continue;

    // 1. 스킬에서 필요한 도구 수집
    const skillTools = new Set<string>();
    for (const skillName of config.skills || []) {
      const skill = skillDefs.skills[skillName];
      if (skill) {
        skill.requiredTools.forEach(t => skillTools.add(t));
      }
    }

    // 2. 직접 지정된 도구 추가
    for (const toolName of config.tools || []) {
      skillTools.add(toolName);
    }

    // 3. ToolRegistry에서 도구 객체 가져오기
    const tools = ToolRegistry.getMany(Array.from(skillTools));

    // 4. 에이전트 생성 시 도구 주입
    const AgentClass = await loadAgentClass(config.name);
    const agent = new AgentClass(config, tools);
    this.agents.set(config.name, agent);
  }
}
```

## 6. 관리자 워크플로우

### 새 도구 추가

```
1. src/tools/my-tool.ts 작성 → ToolRegistry.register()
2. settings/skills.yaml에서 해당 스킬의 requiredTools에 추가
3. settings/agents.yaml에서 에이전트에 스킬 또는 도구 추가
4. 배포
```

### 기존 에이전트에 스킬 추가 (배포 불필요)

```yaml
# agents.yaml만 수정
- name: data-agent
  skills:
    - text-to-sql
    - chart-generation
    - data-export
    - anomaly-detect    # ← 추가 (도구가 이미 ToolRegistry에 있으면)
```

### 에이전트에서 스킬 제거 (배포 불필요)

```yaml
- name: data-agent
  skills:
    - text-to-sql
    # - chart-generation   ← 주석 처리 or 삭제
    - data-export
```

## 7. 설계 결정 이유

| 결정 | 이유 |
|------|------|
| Agent > Skill > Tool 3계층 | 도구 재사용 + 스킬 조합의 유연성 |
| ToolRegistry (공유) | 같은 snowflake 도구를 여러 에이전트가 사용 |
| skills.yaml로 스킬 정의 | 어떤 도구 조합이 하나의 스킬인지 선언적 관리 |
| agents.yaml에 skills + tools | 스킬 단위로 세팅 + 개별 도구 추가도 가능 |
| schedule 필드 | 에이전트별 자동 실행 스케줄을 설정에서 관리 |
| guardrails per skill | 모든 도구에 같은 guardrail 적용이 아닌, 스킬별 차등 |
