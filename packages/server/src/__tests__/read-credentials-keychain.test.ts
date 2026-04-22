import { describe, it, expect } from 'vitest';
import { parseKeychainPayload } from '../llm/model-factory.js';

describe('parseKeychainPayload', () => {
  it('returns null when payload is empty', () => {
    expect(parseKeychainPayload('', 'user:inference')).toBeNull();
  });

  it('returns null when scopes do not include inference', () => {
    const payload = JSON.stringify({
      claudeAiOauth: {
        accessToken: 'tok',
        refreshToken: 'ref',
        expiresAt: 1,
        scopes: ['user:profile'],
      },
    });
    expect(parseKeychainPayload(payload, 'user:inference')).toBeNull();
  });

  it('extracts accessToken / refreshToken / expiresAt when scope present', () => {
    const payload = JSON.stringify({
      claudeAiOauth: {
        accessToken: 'tok',
        refreshToken: 'ref',
        expiresAt: 1_776_000_000_000,
        scopes: ['user:profile', 'user:inference'],
      },
    });
    const parsed = parseKeychainPayload(payload, 'user:inference')!;
    expect(parsed.accessToken).toBe('tok');
    expect(parsed.refreshToken).toBe('ref');
    expect(parsed.expiresAt).toBe(1_776_000_000_000);
  });

  it('returns null on malformed JSON', () => {
    expect(parseKeychainPayload('{nope', 'user:inference')).toBeNull();
  });
});
