/**
 * Config Loader — settings/*.yaml 파일을 로드하고 캐싱
 *
 * Montgomery 패턴:
 * - dj/constants.ts의 loadServicesFromCSV (런타임 파일 로딩)
 * - secrets.ts의 TTL 기반 캐싱
 * - sst.config.ts의 copyFiles로 Lambda에 번들
 *
 * Round 31: Hot-reload 설계 (S3 폴백)
 */

import fs from 'fs';
import path from 'path';
import { parse as parseYAML } from 'yaml';

interface CachedConfig {
  data: any;
  loadedAt: number;
}

const cache = new Map<string, CachedConfig>();
const TTL_MS = 5 * 60 * 1000; // 5분 캐시 (Montgomery credential TTL 패턴)

/**
 * YAML 설정 파일 로드 (캐싱 포함)
 * Lambda 번들의 settings/ 디렉토리에서 로드
 */
export function loadConfig<T>(configName: string): T {
  const cached = cache.get(configName);
  if (cached && Date.now() - cached.loadedAt < TTL_MS) {
    return cached.data as T;
  }

  const filePath = path.join(process.cwd(), 'settings', `${configName}.yaml`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Config file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const data = parseYAML(content);

  cache.set(configName, { data, loadedAt: Date.now() });
  return data as T;
}

/**
 * Semantic Layer 메트릭 정의 로드
 */
export interface MetricDefinition {
  name: string;
  aliases: string[];
  sql: string;
  table: string;
  preAggregatedColumn?: string;
  timeGrain: string;
  dimensions: string[];
  defaultTimeRange?: string;
}

export function loadSemanticLayer(): { metrics: Record<string, MetricDefinition>; appAliases: Record<string, string> } {
  return loadConfig('semantic-layer');
}

/**
 * Feature Flag 로드
 */
export interface FeatureFlag {
  enabled: boolean;
  rolloutPercentage: number;
  allowedUsers?: string[];
  description: string;
}

export function loadFeatureFlags(): { flags: Record<string, FeatureFlag> } {
  return loadConfig('feature-flags');
}

/**
 * Domain Glossary 로드
 */
export function loadDomainGlossary(): { terms: Array<{ term: string; aliases?: string[]; definition: string; table?: string; column?: string }> } {
  return loadConfig('domain-glossary');
}

/**
 * 특정 메트릭을 이름 또는 별칭으로 검색
 */
export function findMetric(query: string): MetricDefinition | undefined {
  const { metrics } = loadSemanticLayer();
  const lowerQuery = query.toLowerCase();

  for (const [key, metric] of Object.entries(metrics)) {
    if (key === lowerQuery) return metric;
    if (metric.aliases?.some((a: string) => a.toLowerCase() === lowerQuery)) return metric;
  }
  return undefined;
}

/**
 * Feature flag 체크
 */
export function isFeatureEnabled(flagName: string, userId?: string): boolean {
  try {
    const { flags } = loadFeatureFlags();
    const flag = flags[flagName];
    if (!flag || !flag.enabled) return false;
    if (userId && flag.allowedUsers?.includes(userId)) return true;
    if (flag.rolloutPercentage >= 100) return true;
    if (userId) {
      const hash = simpleHash(`${flagName}:${userId}`) % 100;
      return hash < flag.rolloutPercentage;
    }
    return flag.rolloutPercentage >= 100;
  } catch {
    return false;
  }
}

// ── Helpers ──

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// yaml 패키지 사용 (package.json에 추가됨)
