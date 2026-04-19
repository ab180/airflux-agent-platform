import { beforeEach, describe, expect, it } from 'vitest';
import { insertFeedback, queryFeedback, type Feedback } from '../store/feedback-store.js';
import { getDb } from '../store/db.js';
import { randomUUID } from 'crypto';

function mk(userId: string, agent = 'test-agent'): Feedback {
  return {
    id: randomUUID(),
    traceId: randomUUID(),
    rating: 'positive',
    comment: null,
    userId,
    agent,
    timestamp: new Date().toISOString(),
  };
}

describe('queryFeedback userId filter', () => {
  beforeEach(() => {
    // Clean the table so we observe only rows we insert in this test.
    try {
      getDb().exec('DELETE FROM feedback');
    } catch {
      // table may not exist yet — that's fine, insertFeedback creates it
    }
  });

  it('returns only matching user rows when userId filter is set', () => {
    insertFeedback(mk('alice'));
    insertFeedback(mk('alice'));
    insertFeedback(mk('bob'));

    const aliceOnly = queryFeedback({ userId: 'alice' });
    expect(aliceOnly.total).toBe(2);
    expect(aliceOnly.feedback.every((f) => f.userId === 'alice')).toBe(true);

    const bobOnly = queryFeedback({ userId: 'bob' });
    expect(bobOnly.total).toBe(1);
  });

  it('returns all rows (cross-user) when userId is omitted (admin view)', () => {
    insertFeedback(mk('alice'));
    insertFeedback(mk('bob'));

    const all = queryFeedback({});
    expect(all.total).toBe(2);
  });
});
