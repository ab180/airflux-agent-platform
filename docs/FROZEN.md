# Frozen Features

This document tracks features that exist in the codebase but are intentionally
not being extended. Each entry states:

- **What**: the feature/module
- **Why frozen**: reason for pause
- **Unfreeze condition**: what needs to be true to resume work
- **Owner**: current decision-maker

## Currently Frozen (as of 2026-04-18)

### 1. Scheduler autonomous heartbeat (ops-agent every 2min)

- **Module**: `packages/server/src/scheduler/scheduler.ts` — heartbeat loop
- **Why**: no proven demand for autonomous multi-agent operation; distracts
  from the core single-agent copilot flow that matters for the Dust-style
  company platform vision.
- **Unfreeze**: at least 2 real scheduled reports in production use with
  positive user feedback.
- **Runtime guard**: set `enabled: false` on the `heartbeat` schedule under
  `ops-agent` in `settings/agents.yaml`. Scheduler already skips disabled
  entries (see `scheduler.ts:47`).
- **Owner**: Hyeonjae
- **Review 2026-04-27 — verdict: HOLD.**
  - `settings/agents.yaml:64` — heartbeat schedule still `enabled: false`
    with FROZEN annotation; FROZEN guard comment intact at
    `packages/server/src/scheduler/scheduler.ts:10-16`.
  - `settings/cron-reports.yaml` does not exist; the schema is marked
    `ARCHIVED — scheduler heartbeat FROZEN` in
    `docs/design/reference/03-config-schemas.md`.
  - The only registered cron task is `daily-eval`, gated behind
    `AIRFLUX_ENABLE_DAILY_EVAL=true` (eval runner, not a user-facing
    scheduled report).
  - `docs/STATUS.md` makes no mention of scheduled reports being live.
  - **Conclusion:** zero scheduled reports in production → unfreeze
    condition (≥2 reports + positive feedback) is **not met**. Continue to
    hold; revisit when the first cron-report ships.

### 2. Inter-agent message bus (expansion)

- **Module**: `packages/server/src/bus/message-bus.ts`
- **Status**: existing code remains usable; no new message types, new
  producers, or new consumers.
- **Why**: multi-agent coordination is speculative. No user has asked for it.
  Dust-style copilot does not require agents to talk to each other.
- **Unfreeze**: documented user story where >1 agent collaborates on a task
  with retry/recovery semantics.
- **Owner**: Hyeonjae

### 3. Codex CLI fallback (production path)

- **Module**: `packages/server/src/llm/codex-cli-provider.ts`
- **Status**: local experimentation allowed; production `model-factory.ts`
  does not route through codex CLI.
- **Why**: single LLM provider reduces complexity. OpenAI access for
  production is TBD and depends on business decision.
- **Unfreeze**: business need for an OpenAI-specific model (o3 reasoning,
  specific tool-use advantage).
- **Owner**: Hyeonjae

## Unfreeze Protocol

To unfreeze a feature:

1. Document the triggering condition being met (evidence).
2. Remove the `// FROZEN: ...` block comment from the module.
3. Delete or update the entry in this file.
4. Open a plan under `docs/superpowers/plans/` for the follow-up work.

## See also

- `docs/local-vs-prod-matrix.md` — runtime mode gating rules
- `docs/design/architecture/19-orchestrator-detail.md` — a separate deferral
  (Orchestrator class), tracked there instead of here
