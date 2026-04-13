/**
 * Feature flag system.
 * Loads flags from YAML config and provides runtime evaluation.
 */

export interface FeatureFlag {
  enabled: boolean;
  description: string;
  rollout: number; // 0-100 percentage
}

export interface FeatureFlagsConfig {
  flags: Record<string, FeatureFlag>;
}

export class FeatureFlagService {
  private flags: Map<string, FeatureFlag>;

  constructor(config: FeatureFlagsConfig) {
    this.flags = new Map(Object.entries(config.flags || {}));
  }

  isEnabled(name: string): boolean {
    const flag = this.flags.get(name);
    if (!flag) return true; // Unknown flags default to enabled
    if (!flag.enabled) return false;
    if (flag.rollout < 100) {
      // Simple deterministic rollout based on flag name hash
      const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      return (hash % 100) < flag.rollout;
    }
    return true;
  }

  getFlag(name: string): FeatureFlag | undefined {
    return this.flags.get(name);
  }

  listFlags(): { name: string; flag: FeatureFlag }[] {
    return Array.from(this.flags.entries()).map(([name, flag]) => ({
      name,
      flag,
    }));
  }

  setFlag(name: string, enabled: boolean): void {
    const existing = this.flags.get(name);
    if (existing) {
      existing.enabled = enabled;
    } else {
      this.flags.set(name, { enabled, description: '', rollout: 100 });
    }
  }
}
