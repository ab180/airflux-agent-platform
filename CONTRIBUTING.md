# Contributing to Airflux Agent Platform

AB180의 AI 에이전트 관리 플랫폼에 기여해주셔서 감사합니다!

## Quick Start

```bash
# 1. Fork & clone
git clone https://github.com/ab180/airflux-agent-platform.git
cd airflux-agent-platform

# 2. Install dependencies
npm install

# 3. Copy environment template
cp .env.example .env.local

# 4. Build core package (server depends on it)
npm run build --workspace=@airflux/core

# 5. Start development servers
npm run dev
# Server: http://localhost:3000
# Dashboard: http://localhost:3001

# 6. Run tests
npm test
```

## Project Structure

```
packages/core/     — Agent/Skill/Tool framework (published as @airflux/core)
packages/server/   — Hono API server + SQLite
apps/dashboard/    — Next.js 16 admin dashboard
settings/          — YAML configuration files
```

## Development Workflow

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make changes
3. Run tests: `npm test`
4. Run build: `npm run build`
5. Submit a PR

## Adding a New Agent

**Via Dashboard:** Settings > Agents > "+ 에이전트 추가"

**Via YAML:**
```yaml
# settings/agents.yaml
- name: my-agent
  enabled: true
  model: default
  tools: [echo, calculate]
```

## Adding a New Tool

Edit `packages/server/src/bootstrap.ts` and register with `ToolRegistry.register()`:

```typescript
ToolRegistry.register('myTool', {
  description: 'What this tool does',
  inputSchema: z.object({ param: z.string() }),
  execute: async (input) => {
    const { param } = input as { param: string };
    return { result: param };
  },
});
```

## Testing

```bash
npm test                              # All tests (223+)
npm test --workspace=@airflux/core    # Core only
npm test --workspace=@airflux/server  # Server only
```

## OSS split boundary — `ab180-extensions/`

이 레포는 범용 OSS `airops` 의 레퍼런스 구현이자 AB180 사내 인스턴스를
겸합니다. AB180 도메인(Airbridge / Snowflake / 한국어 비즈니스 용어)
의존 코드는 `packages/server/src/ab180-extensions/` 한 곳에만 둡니다.
authoritative reference: [`packages/server/src/ab180-extensions/AGENTS.md`](packages/server/src/ab180-extensions/AGENTS.md).

기여 시 지켜야 할 것:

- **일반 코드에서 `ab180-extensions/` 를 import 하지 않는다.** 동적 로드는
  `bootstrap.ts` 의 `hasAb180Config()` 게이트 뒤에서만.
- **도메인 누출 금지.** Airflux/Airbridge/Snowflake 를 직접 참조하는
  tool/label/error/prompt 는 모두 `ab180-extensions/` 안에. 일반 툴은
  `registerBuiltInTools()` 에 추가.
- **추가만 허용.** `registerAb180Tools()` 는 새 tool id 등록 전용 —
  일반 툴을 mutate/override 하지 말 것.
- **새 ab180 tool 은 contract test 1건 이상.** AGENTS.md 의 "Testing
  contract" 섹션 참조.

generic OSS 영역(`packages/core`, `packages/server` 의 `routes/`,
`agents/`, `runtime/`, `llm/` 등)에 PR 을 낼 때는 이 경계를 깨지
않는지 확인. 모르면 PR 에 질문으로 남겨주세요.

## Code Style

- TypeScript strict mode
- Use structured logger (`logger.info/warn/error`), not `console.log`
- Use `fetchClient`/`postClient` in dashboard, not raw `fetch`
- Korean UI text, English code/comments
- All tables need `scope="col"` and status indicators need `aria-label`

## Security

- All SQL queries use parameterized statements
- Prompt injection: 19-pattern guardrail
- SSRF protection on httpGet tool
- PII masking on LLM responses
- Timing-safe admin auth comparison

## License

MIT
