import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isFeatureEnabled } from '../../src/utils/config-loader';

// Mock fs for config loading
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => `
flags:
  test_feature:
    enabled: true
    rolloutPercentage: 50
    description: "Test feature"
  disabled_feature:
    enabled: false
    rolloutPercentage: 0
    description: "Disabled"
  full_rollout:
    enabled: true
    rolloutPercentage: 100
    description: "Full"
  user_restricted:
    enabled: true
    rolloutPercentage: 0
    allowedUsers:
      - U_ADMIN
    description: "Admin only"
`),
  },
}));

describe('isFeatureEnabled', () => {
  it('should return true for full rollout features', () => {
    expect(isFeatureEnabled('full_rollout')).toBe(true);
  });

  it('should return false for disabled features', () => {
    expect(isFeatureEnabled('disabled_feature')).toBe(false);
  });

  it('should return false for unknown features', () => {
    expect(isFeatureEnabled('nonexistent')).toBe(false);
  });

  it('should return true for allowed users regardless of rollout', () => {
    expect(isFeatureEnabled('user_restricted', 'U_ADMIN')).toBe(true);
  });

  it('should return false for non-allowed users with 0% rollout', () => {
    expect(isFeatureEnabled('user_restricted', 'U_REGULAR')).toBe(false);
  });

  it('should be deterministic for same user+flag combination', () => {
    const result1 = isFeatureEnabled('test_feature', 'U_USER1');
    const result2 = isFeatureEnabled('test_feature', 'U_USER1');
    expect(result1).toBe(result2); // 같은 입력 → 같은 결과
  });
});
