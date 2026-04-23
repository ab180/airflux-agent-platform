import { describe, it, expect } from 'vitest';
import { createNetworkState, type NetworkState } from '../network-state.js';

describe('NetworkState', () => {
  it('creates an empty state with no history', () => {
    const s = createNetworkState();
    expect(s.history).toEqual([]);
    expect(s.data).toEqual({});
  });

  it('accepts seed data typed by generic', () => {
    interface MyData extends Record<string, unknown> { userId: string; orgId?: string }
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
    expect(s.history[1]).toMatchObject({ agent: 'chart-agent', reason: 'llm:selected for viz' });
    expect(s.history[0].at).toBeGreaterThan(0);
  });
});
