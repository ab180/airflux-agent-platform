import { describe, expect, it } from 'vitest';
import {
  toWireEvent,
  formatSSELine,
  type WireEvent,
} from '../streaming/stream-events.js';

describe('toWireEvent', () => {
  it('maps text-delta to text event', () => {
    const e = toWireEvent({ type: 'text-delta', id: 't1', text: '안녕' } as any);
    expect(e).toEqual({ type: 'text', delta: '안녕' });
  });

  it('maps tool-call to tool-call event', () => {
    const e = toWireEvent({
      type: 'tool-call',
      toolCallId: 'c1',
      toolName: 'queryData',
      input: { table: 'events' },
    } as any);
    expect(e).toEqual({
      type: 'tool-call',
      id: 'c1',
      tool: 'queryData',
      args: { table: 'events' },
    });
  });

  it('maps tool-result to tool-result event with summarized output', () => {
    const e = toWireEvent({
      type: 'tool-result',
      toolCallId: 'c1',
      toolName: 'queryData',
      output: { rows: [{ day: '2026-04-19', dau: 1234 }] },
    } as any);
    expect(e?.type).toBe('tool-result');
    if (e?.type === 'tool-result') {
      expect(e.tool).toBe('queryData');
      expect(e.id).toBe('c1');
      // Summary is a string representation bounded in length
      expect(typeof e.summary).toBe('string');
      expect(e.summary.length).toBeLessThanOrEqual(300);
      expect(e.summary).toContain('1234');
    }
  });

  it('maps tool-error to tool-error event', () => {
    const e = toWireEvent({
      type: 'tool-error',
      toolCallId: 'c1',
      toolName: 'queryData',
      error: new Error('timeout'),
    } as any);
    expect(e).toEqual({
      type: 'tool-error',
      id: 'c1',
      tool: 'queryData',
      message: 'timeout',
    });
  });

  it('maps finish to done event with usage + stop reason', () => {
    const e = toWireEvent({
      type: 'finish',
      finishReason: 'stop',
      totalUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    } as any);
    expect(e).toEqual({
      type: 'done',
      finishReason: 'stop',
      usage: { inputTokens: 100, outputTokens: 50 },
    });
  });

  it('maps error to error event', () => {
    const e = toWireEvent({ type: 'error', error: new Error('oops') } as any);
    expect(e).toEqual({ type: 'error', message: 'oops' });
  });

  it('returns null for internal events we do not forward', () => {
    expect(toWireEvent({ type: 'text-start', id: 't1' } as any)).toBeNull();
    expect(toWireEvent({ type: 'text-end', id: 't1' } as any)).toBeNull();
    expect(toWireEvent({ type: 'start' } as any)).toBeNull();
    expect(toWireEvent({ type: 'start-step' } as any)).toBeNull();
    expect(toWireEvent({ type: 'finish-step' } as any)).toBeNull();
    expect(toWireEvent({ type: 'tool-input-start' } as any)).toBeNull();
    expect(toWireEvent({ type: 'tool-input-delta' } as any)).toBeNull();
  });
});

describe('formatSSELine', () => {
  it('emits "data: <json>\\n\\n"', () => {
    const ev: WireEvent = { type: 'text', delta: '안녕' };
    expect(formatSSELine(ev)).toBe('data: {"type":"text","delta":"안녕"}\n\n');
  });

  it('handles escaping of newlines in payload', () => {
    const ev: WireEvent = { type: 'text', delta: 'line1\nline2' };
    const s = formatSSELine(ev);
    expect(s.startsWith('data: ')).toBe(true);
    expect(s.endsWith('\n\n')).toBe(true);
    // Parse the payload back — must be valid JSON
    const payload = s.slice('data: '.length, -2);
    expect(JSON.parse(payload)).toEqual(ev);
  });
});
