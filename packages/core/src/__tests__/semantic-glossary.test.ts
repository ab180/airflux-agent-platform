import { describe, it, expect } from 'vitest';
import { SemanticLayer } from '../utils/semantic-layer.js';
import { DomainGlossary } from '../utils/domain-glossary.js';
import { FeatureFlagService } from '../utils/feature-flags.js';

describe('SemanticLayer', () => {
  const layer = new SemanticLayer({
    database: 'snowflake',
    schema: 'airflux_prod',
    tables: {
      events: {
        description: 'Event log',
        columns: [
          { name: 'event_id', type: 'STRING', description: 'Event ID' },
          { name: 'app_id', type: 'INTEGER', description: 'App ID' },
        ],
      },
      users: {
        description: 'User profiles',
        columns: [
          { name: 'user_id', type: 'STRING', description: 'User ID' },
        ],
      },
    },
    metrics: {
      DAU: { description: 'Daily active users', sql: 'COUNT(DISTINCT user_id)...' },
      revenue: { description: 'Total revenue', sql: 'SUM(revenue)...' },
    },
  });

  it('lists tables', () => {
    expect(layer.listTables()).toEqual(['events', 'users']);
  });

  it('gets table definition', () => {
    const t = layer.getTable('events');
    expect(t?.description).toBe('Event log');
    expect(t?.columns).toHaveLength(2);
  });

  it('returns undefined for missing table', () => {
    expect(layer.getTable('missing')).toBeUndefined();
  });

  it('lists metrics', () => {
    expect(layer.listMetrics()).toEqual(['DAU', 'revenue']);
  });

  it('gets metric definition', () => {
    const m = layer.getMetric('DAU');
    expect(m?.description).toBe('Daily active users');
    expect(m?.sql).toBeDefined();
  });

  it('generates prompt context', () => {
    const ctx = layer.toPromptContext();
    expect(ctx).toContain('snowflake');
    expect(ctx).toContain('events');
    expect(ctx).toContain('DAU');
  });
});

describe('DomainGlossary', () => {
  const glossary = new DomainGlossary({
    terms: {
      DAU: {
        canonical: 'Daily Active Users',
        aliases: ['일간 활성 사용자', '일활'],
        description: '하루 동안 앱을 사용한 고유 사용자 수',
      },
      리텐션: {
        canonical: 'Retention Rate',
        aliases: ['잔존율', 'retention'],
        description: '특정 기간 후 앱에 복귀한 사용자 비율',
      },
    },
  });

  it('resolves canonical name', () => {
    const r = glossary.resolve('DAU');
    expect(r?.canonical).toBe('Daily Active Users');
  });

  it('resolves Korean alias', () => {
    const r = glossary.resolve('일활');
    expect(r?.canonical).toBe('Daily Active Users');
  });

  it('resolves case-insensitively', () => {
    const r = glossary.resolve('dau');
    expect(r?.canonical).toBe('Daily Active Users');
  });

  it('returns null for unknown term', () => {
    expect(glossary.resolve('unknown')).toBeNull();
  });

  it('finds terms in text', () => {
    const results = glossary.resolveAll('DAU와 리텐션을 비교해줘');
    expect(results).toHaveLength(2);
    expect(results.map(r => r.key)).toContain('DAU');
    expect(results.map(r => r.key)).toContain('리텐션');
  });

  it('lists all terms', () => {
    expect(glossary.listTerms()).toHaveLength(2);
  });
});

describe('FeatureFlagService', () => {
  const flags = new FeatureFlagService({
    flags: {
      enabled_flag: { enabled: true, description: 'Test', rollout: 100 },
      disabled_flag: { enabled: false, description: 'Off', rollout: 100 },
      partial_flag: { enabled: true, description: 'Partial', rollout: 50 },
    },
  });

  it('returns true for enabled flag', () => {
    expect(flags.isEnabled('enabled_flag')).toBe(true);
  });

  it('returns false for disabled flag', () => {
    expect(flags.isEnabled('disabled_flag')).toBe(false);
  });

  it('defaults to true for unknown flag', () => {
    expect(flags.isEnabled('nonexistent')).toBe(true);
  });

  it('lists all flags', () => {
    expect(flags.listFlags()).toHaveLength(3);
  });

  it('can toggle flag at runtime', () => {
    flags.setFlag('disabled_flag', true);
    expect(flags.isEnabled('disabled_flag')).toBe(true);
    flags.setFlag('disabled_flag', false); // reset
  });
});
