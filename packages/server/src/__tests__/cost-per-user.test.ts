import { describe, expect, it, beforeEach } from 'vitest';
import {
  recordCost,
  getCostByUser,
  resetDailyCostForTest,
} from '../llm/cost-tracker.js';
import { runWithRequestContext } from '../runtime/request-context.js';

describe('recordCost + getCostByUser (in-memory)', () => {
  beforeEach(() => {
    resetDailyCostForTest();
  });

  it('aggregates cost per user when userId is passed explicitly', () => {
    recordCost({
      timestamp: new Date().toISOString(),
      agent: 'a',
      model: 'fast',
      inputTokens: 1000,
      outputTokens: 500,
      durationMs: 100,
      userId: 'alice',
    });
    recordCost({
      timestamp: new Date().toISOString(),
      agent: 'a',
      model: 'fast',
      inputTokens: 2000,
      outputTokens: 1000,
      durationMs: 200,
      userId: 'alice',
    });
    recordCost({
      timestamp: new Date().toISOString(),
      agent: 'a',
      model: 'fast',
      inputTokens: 500,
      outputTokens: 100,
      durationMs: 50,
      userId: 'bob',
    });

    const agg = getCostByUser();
    const alice = agg.find((r) => r.userId === 'alice');
    const bob = agg.find((r) => r.userId === 'bob');
    expect(alice).toBeDefined();
    expect(bob).toBeDefined();
    expect(alice!.entries).toBe(2);
    expect(bob!.entries).toBe(1);
    expect(alice!.totalUsd).toBeGreaterThan(bob!.totalUsd);
  });

  it('pulls userId from request context when not passed explicitly', async () => {
    await runWithRequestContext(
      { userId: 'carol', sessionId: 's1', source: 'test' },
      async () => {
        recordCost({
          timestamp: new Date().toISOString(),
          agent: 'a',
          model: 'fast',
          inputTokens: 100,
          outputTokens: 50,
          durationMs: 10,
        });
      },
    );
    const agg = getCostByUser();
    expect(agg.find((r) => r.userId === 'carol')).toBeDefined();
  });

  it('falls back to "system" when no userId and no context', () => {
    recordCost({
      timestamp: new Date().toISOString(),
      agent: 'a',
      model: 'fast',
      inputTokens: 100,
      outputTokens: 50,
      durationMs: 10,
    });
    const agg = getCostByUser();
    expect(agg.find((r) => r.userId === 'system')).toBeDefined();
  });
});
