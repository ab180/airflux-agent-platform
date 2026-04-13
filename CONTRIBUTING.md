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
