import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getConversationStoreBackend } from '../store/conversation-store.js';
import { getFeedbackStoreBackend } from '../store/feedback-store.js';
import { isPostgresAvailable } from '../store/pg.js';
import { resetEnvironmentCache } from '../runtime/environment.js';

describe('store backend selection (environment-aware)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetEnvironmentCache();
  });

  it('uses sqlite when DATABASE_URL is unset', () => {
    vi.stubEnv('DATABASE_URL', '');
    expect(getConversationStoreBackend()).toBe('sqlite');
    expect(getFeedbackStoreBackend()).toBe('sqlite');
    expect(isPostgresAvailable()).toBe(false);
  });

  it('uses postgres when DATABASE_URL is set', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://u:p@h/db');
    expect(getConversationStoreBackend()).toBe('postgres');
    expect(getFeedbackStoreBackend()).toBe('postgres');
    expect(isPostgresAvailable()).toBe(true);
  });
});
