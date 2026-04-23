# P1: Router NetworkState Upgrade Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `AgentRouter` in `@airflux/core` to carry a typed `NetworkState` across routing decisions, so multi-agent workflows can share context (who asked, which agents ran, scratchpad). Backward compatible — existing `route(query)` calls keep working.

**Architecture:** Inngest Agent Kit-style `NetworkState<T>`. `T` is user-extended schema. Router accepts optional `state` parameter and passes it to `llmRouter`. Keyword/pattern routing unchanged — NetworkState is additive.

**Tech Stack:** TypeScript 5, Vitest 3, existing `@airflux/core` structure.

**Reference:** `docs/superpowers/specs/2026-04-23-airops-platform-vision.md` Round 6 + Angle 1 "훔쳐야 할 아이디어 5개 #1".

---

## File Structure

- **Create**: `packages/core/src/routing/network-state.ts` — NetworkState type + helpers
- **Modify**: `packages/core/src/routing/router.ts` — extend Router to accept state
- **Modify**: `packages/core/src/index.ts` — export NetworkState
- **Create**: `packages/core/src/routing/__tests__/network-state.test.ts`
- **Modify**: `packages/core/src/__tests__/router.test.ts` — add state-aware cases
- **Modify** (optional): `packages/server/src/routes/query.ts` + `query-stream.ts` — pass NetworkState if present in request

---

## Task 1: Define NetworkState type

**Files:**
- Create: `packages/core/src/routing/network-state.ts`
- Test: `packages/core/src/routing/__tests__/network-state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/routing/__tests__/network-state.test.ts
import { describe, it, expect } from 'vitest';
import { createNetworkState, type NetworkState } from '../network-state.js';

describe('NetworkState', () => {
  it('creates an empty state with no history', () => {
    const s = createNetworkState();
    expect(s.history).toEqual([]);
    expect(s.data).toEqual({});
  });

  it('accepts seed data typed by generic', () => {
    interface MyData { userId: string; orgId?: string }
    const s: NetworkState<MyData> = createNetworkState<MyData>({
      data: { userId: 'u1' },
    });
    expect(s.data.userId).toBe('u1');
  });

  it('records routing history via pushAgent', () => {
    const s = createNetworkState();
    s.pushAgent('sql-agent', 'keyword:DAU');
    s.pushAgent('chart-agent', 'llm:selected for viz');
    expect(s.history).toHaveLength(2);
    expect(s.history[0]).toMatchObject({ agent: 'sql-agent', reason: 'keyword:DAU' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/ab180/conductor/workspaces/airflux-agent-platform/lyon-v1 && npm run test --workspace=@airflux/core -- network-state 2>&1 | tail -20`
Expected: FAIL with "Cannot find module '../network-state.js'"

- [ ] **Step 3: Implement NetworkState**

```ts
// packages/core/src/routing/network-state.ts
export interface RoutingHistoryEntry {
  agent: string;
  reason: string;
  at: number;
}

export interface NetworkState<TData extends Record<string, unknown> = Record<string, unknown>> {
  history: RoutingHistoryEntry[];
  data: TData;
  pushAgent(agent: string, reason: string): void;
}

export interface CreateNetworkStateOptions<T extends Record<string, unknown>> {
  data?: T;
}

export function createNetworkState<T extends Record<string, unknown> = Record<string, unknown>>(
  options: CreateNetworkStateOptions<T> = {},
): NetworkState<T> {
  const history: RoutingHistoryEntry[] = [];
  const data = (options.data ?? {}) as T;
  return {
    history,
    data,
    pushAgent(agent, reason) {
      history.push({ agent, reason, at: Date.now() });
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=@airflux/core -- network-state 2>&1 | tail -10`
Expected: PASS (3 tests)

- [ ] **Step 5: Export from core index**

Edit `packages/core/src/index.ts` — add:
```ts
export * from './routing/network-state.js';
```

(If `./routing/router.js` already exports, add this alongside. Check first with: `grep "network-state\|routing" packages/core/src/index.ts`.)

- [ ] **Step 6: Run core build to verify exports**

Run: `npm run build --workspace=@airflux/core 2>&1 | tail -5`
Expected: no tsc errors.

---

## Task 2: Extend AgentRouter to accept NetworkState

**Files:**
- Modify: `packages/core/src/routing/router.ts`
- Modify: `packages/core/src/__tests__/router.test.ts`

- [ ] **Step 1: Inspect existing test patterns**

Run: `cat packages/core/src/__tests__/router.test.ts | head -80`
Note: the existing test style — copy the pattern for new cases.

- [ ] **Step 2: Write failing test for stateful routing**

Append to `packages/core/src/__tests__/router.test.ts`:

```ts
  describe('with NetworkState', () => {
    it('records routing history into provided state', async () => {
      AgentRegistry.clear();
      AgentRegistry.register({ name: 'sql-agent', config: { description: 'sql' }, isEnabled: () => true } as any);

      const router = new AgentRouter({
        rules: [{ agent: 'sql-agent', priority: 1, keywords: ['sql'] }],
        fallback: 'sql-agent',
      });

      const state = createNetworkState();
      const result = await router.route('give me the sql', state);

      expect(result.agent).toBe('sql-agent');
      expect(state.history).toHaveLength(1);
      expect(state.history[0]).toMatchObject({ agent: 'sql-agent', reason: 'keyword:sql' });
    });

    it('passes state.data to llmRouter when provided', async () => {
      AgentRegistry.clear();
      AgentRegistry.register({ name: 'chief', config: { description: 'chief' }, isEnabled: () => true } as any);

      let receivedState: unknown;
      const router = new AgentRouter({
        rules: [],
        fallback: 'chief',
      }, {
        llmRouter: async (_q, _c, s) => {
          receivedState = s;
          return { agent: 'chief' };
        },
      });

      const state = createNetworkState<{ userId: string }>({ data: { userId: 'u1' } });
      await router.route('some query', state);
      expect(receivedState).toBe(state);
    });
  });
```

Add import at top of test file: `import { createNetworkState } from '../routing/network-state.js';`

- [ ] **Step 3: Run test to verify failure**

Run: `npm run test --workspace=@airflux/core -- router 2>&1 | tail -20`
Expected: FAIL on type or on state.history being empty.

- [ ] **Step 4: Update Router implementation**

Edit `packages/core/src/routing/router.ts`:

Change the `llmRouter` signature in `AgentRouterOptions`:
```ts
export interface AgentRouterOptions {
  llmRouter?: (
    query: string,
    candidates: RoutingCandidate[],
    state?: NetworkState,
  ) => Promise<LLMRouteDecision | null>;
}
```

Change `route()` signature and body:
```ts
async route(query: string, state?: NetworkState): Promise<RouteResult> {
  const lowerQuery = query.toLowerCase();

  for (const rule of this.rules) {
    const agent = AgentRegistry.getOptional(rule.agent);
    if (!agent || !agent.isEnabled()) continue;

    if (rule.keywords) {
      for (const kw of rule.keywords) {
        if (lowerQuery.includes(kw.toLowerCase())) {
          const reason = `keyword:${kw}`;
          state?.pushAgent(rule.agent, reason);
          return { agent: rule.agent, matchedRule: reason };
        }
      }
    }

    const patterns = this.compiledPatterns.get(rule.agent);
    if (patterns) {
      for (const pattern of patterns) {
        if (pattern.test(query)) {
          const reason = `pattern:${pattern.source}`;
          state?.pushAgent(rule.agent, reason);
          return { agent: rule.agent, matchedRule: reason };
        }
      }
    }
  }

  if (this.llmRouter) {
    const candidates = AgentRegistry.listEnabled().map(agent => ({
      name: agent.name,
      description: agent.config.description,
    }));

    if (candidates.length > 0) {
      const decision = await this.llmRouter(query, candidates, state);
      if (decision?.agent) {
        const selected = AgentRegistry.getOptional(decision.agent);
        if (selected?.isEnabled()) {
          const reason = `llm:${decision.reason ?? 'selected'}`;
          state?.pushAgent(decision.agent, reason);
          return {
            agent: decision.agent,
            matchedRule: null,
            llmRouted: true,
            reason: decision.reason ?? null,
          };
        }
      }
    }
  }

  const fallbackAgent = AgentRegistry.getOptional(this.fallback);
  if (fallbackAgent?.isEnabled()) {
    state?.pushAgent(this.fallback, 'fallback');
    return { agent: this.fallback, matchedRule: null };
  }

  const enabled = AgentRegistry.listEnabled();
  if (enabled.length > 0) {
    state?.pushAgent(enabled[0].name, 'first-enabled');
    return { agent: enabled[0].name, matchedRule: null };
  }

  return { agent: this.fallback, matchedRule: null };
}
```

Add import at top: `import type { NetworkState } from './network-state.js';`

- [ ] **Step 5: Run tests**

Run: `npm run test --workspace=@airflux/core 2>&1 | tail -15`
Expected: all core tests pass (including existing + new).

- [ ] **Step 6: Build to check types**

Run: `npm run build --workspace=@airflux/core 2>&1 | tail -5`
Expected: no errors.

---

## Task 3: Verify server still compiles and tests pass

**Files:**
- No server changes expected (server uses Router without state — still compiles via optional parameter)

- [ ] **Step 1: Run server tests**

Run: `npm run test --workspace=@airflux/server 2>&1 | tail -10`
Expected: all pass, no regression.

- [ ] **Step 2: Run full build**

Run: `npm run build 2>&1 | tail -10`
Expected: all packages build green.

- [ ] **Step 3: Run full test suite**

Run: `npm run test 2>&1 | tail -10`
Expected: all packages pass.

---

## Task 4: Final review

- [ ] **Step 1: Type-check cross-package**

Run: `cd /Users/ab180/conductor/workspaces/airflux-agent-platform/lyon-v1 && npx tsc --noEmit --project packages/core/tsconfig.json 2>&1 | tail -5`
Expected: no errors.

- [ ] **Step 2: Status check**

Run: `git status -s`
Expected output should include:
- M `packages/core/src/routing/router.ts`
- M `packages/core/src/__tests__/router.test.ts`
- M `packages/core/src/index.ts`
- ?? `packages/core/src/routing/network-state.ts`
- ?? `packages/core/src/routing/__tests__/network-state.test.ts`

- [ ] **Step 3: Document in spec (optional pointer)**

Check if `docs/superpowers/specs/2026-04-23-airops-platform-vision.md` already mentions this as done. If not, no action (spec lives at strategy level).

---

## Done Criteria

- [ ] `createNetworkState()` + `NetworkState<T>` exported from `@airflux/core`
- [ ] `AgentRouter.route(query, state?)` accepts optional NetworkState and records history
- [ ] `llmRouter` signature includes `state?` parameter
- [ ] All existing tests still pass
- [ ] ≥3 new tests for NetworkState, ≥2 new tests for stateful routing
- [ ] No server-side code changes required (backward compatible)

## Out of Scope (P1 does NOT include)

- Server `query.ts` / `query-stream.ts` wiring NetworkState from HTTP requests — P?? follow-up
- Multi-agent handoff (networkState.pushAgent during agent execution) — needs P3 runtime
- Persisting state to SQLite — needs runtime migration first
