import { describe, it, expect } from 'vitest';
import { runWithSelfCorrection } from '../guardrails/self-correction.js';

describe('runWithSelfCorrection', () => {
  it('passes on first attempt when guardrails pass', async () => {
    const result = await runWithSelfCorrection(
      ['pii-filter'],
      { text: '앱 123의 DAU 알려줘', type: 'input' },
      async () => '', // never called
    );
    expect(result.finalPass).toBe(true);
    expect(result.totalAttempts).toBe(1);
    expect(result.correctedOn).toBeUndefined();
  });

  it('corrects on retry when correction function fixes the issue', async () => {
    let callCount = 0;
    const result = await runWithSelfCorrection(
      ['read-only'],
      { text: 'INSERT INTO users VALUES (1)', type: 'sql' },
      async (feedback, prev) => {
        callCount++;
        // Correction: replace INSERT with SELECT
        return 'SELECT * FROM users LIMIT 10';
      },
      2,
    );
    expect(result.finalPass).toBe(true);
    expect(result.totalAttempts).toBe(2);
    expect(result.correctedOn).toBe(2);
    expect(callCount).toBe(1);
    expect(result.finalInput).toBe('SELECT * FROM users LIMIT 10');
  });

  it('fails after max retries when correction keeps failing', async () => {
    const result = await runWithSelfCorrection(
      ['read-only'],
      { text: 'DROP TABLE users', type: 'sql' },
      async () => 'DELETE FROM users', // still a write operation
      2,
    );
    expect(result.finalPass).toBe(false);
    expect(result.totalAttempts).toBe(3); // 1 original + 2 retries
  });

  it('handles correction function throwing error', async () => {
    const result = await runWithSelfCorrection(
      ['read-only'],
      { text: 'DROP TABLE users', type: 'sql' },
      async () => { throw new Error('LLM unavailable'); },
      2,
    );
    expect(result.finalPass).toBe(false);
    expect(result.totalAttempts).toBe(1); // stopped after correction fn failed
  });

  it('records all attempts in history', async () => {
    let attempt = 0;
    const result = await runWithSelfCorrection(
      ['row-limit'],
      { text: 'SELECT * FROM events', type: 'sql' },
      async () => {
        attempt++;
        return attempt >= 2 ? 'SELECT * FROM events LIMIT 100' : 'SELECT * FROM events';
      },
      3,
    );
    expect(result.finalPass).toBe(true);
    expect(result.attempts.length).toBeGreaterThanOrEqual(2);
    expect(result.attempts[0].corrected).toBe(false);
  });
});
