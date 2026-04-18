# Local vs Production Matrix

> **Purpose**: single reference for how every subsystem behaves in local
> development vs production deployment. Every new feature MUST add a row here.

## Detection

`packages/server/src/runtime/environment.ts` decides
`mode: 'local' | 'production'` using:

- `AWS_LAMBDA_FUNCTION_NAME` present → production
- `AGENT_API_URL` present → production
- Otherwise → local

Credential strategy follows from the mode:

- **local** → `claude-code` (reads `~/.claude/.credentials.json` + env vars)
- **production** + `AGENT_API_URL` → `internal-api`
- **production** + no `AGENT_API_URL` → `bedrock` (adapter not yet wired)

Storage strategy follows `DATABASE_URL`:

- `DATABASE_URL` set → `postgres`
- otherwise → `sqlite`

## Matrix

| Subsystem | Local mode | Production mode | Switch point |
|-----------|-----------|----------------|--------------|
| LLM credentials | `~/.claude/.credentials.json` (OAuth) + `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` fallbacks | `internal-api` (AGENT_API_URL + AGENT_API_TOKEN) or `bedrock` (Phase 2) | `llm/model-factory.ts` → `runtime/environment.ts#credentialStrategy` |
| Conversation store | SQLite (better-sqlite3) | PostgreSQL via `DATABASE_URL` | `store/conversation-store.ts` + `store/pg.ts#isPostgresAvailable` → `environment.ts#storageStrategy` |
| Feedback store | SQLite (legacy) | SQLite today; Postgres migration planned | `store/feedback-store.ts#getFeedbackStoreBackend` |
| Cost store | in-memory + optional Postgres | Postgres via `DATABASE_URL` | `store/cost-store.ts` via `isPostgresAvailable` |
| Eval store | SQLite | Postgres when `DATABASE_URL` set | `store/eval-store.ts` (Epic 4 wires environment helper) |
| Message bus (FROZEN) | in-memory fallback | Postgres via `DATABASE_URL` | `bus/message-bus.ts` — expansion paused, see `docs/FROZEN.md` |
| Auth | NextAuth Google (dev OAuth app) | NextAuth Google (prod OAuth app) — enterprise SSO deferred | `apps/dashboard/src/app/api/auth/[...nextauth]` |
| Rate limiter | in-memory sliding window | in-memory (swap for Redis when multi-instance) | `middleware/rate-limit.ts` |
| Scheduler | node-cron single instance, heartbeat FROZEN | node-cron single instance, heartbeat FROZEN | `scheduler/scheduler.ts` + `settings/agents.yaml` |
| MCP servers | YAML config + per-user tokens | Same + org-level tokens (Phase 2) | `routes/mcp.ts`, `store/user-mcp-store.ts` |
| RBAC | dev user defaults to admin role | Role enforced per request | `middleware/rbac.ts` + `security/trusted-user.ts` (Epic 5) |
| Per-user cost UI | Backend exists, UI planned | Backend exists, UI planned | `llm/cost-tracker.ts` + dashboard pages (Epic 6) |

## Rules

1. **No new credential/storage/auth path without an `environment.ts` switch.**
2. **Every row MUST have a test** that exercises both modes (or at least the
   local mode plus a mocked production adapter).
3. **Features marked Phase 2** (Bedrock adapter, enterprise SSO, org MCP
   tokens) are known gaps. If you rely on one for a new capability, block
   the capability on the Phase 2 ticket instead of implementing a partial
   workaround.
4. **FROZEN features** (see `docs/FROZEN.md`) stay in their current mode
   until the listed unfreeze condition is met — do not extend.
