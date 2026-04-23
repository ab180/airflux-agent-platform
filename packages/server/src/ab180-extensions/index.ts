/**
 * AB180 domain-specific extensions.
 *
 * This module owns tools and registrations that depend on Airbridge /
 * Snowflake / Korean-language knowledge. The generic airops platform
 * must not import from here directly. `bootstrap.ts` gates this on
 * the presence of Airbridge-shaped settings so an OSS checkout without
 * `semantic-layer.yaml` / `domain-glossary.yaml` cleanly skips it.
 *
 * Long-term plan (see vision spec §「패키지 토폴로지」): these tools
 * move to a separate `@airops-ab180/tools` package in a private fork.
 * The interface below is the future extraction point.
 */

import { z } from 'zod';
import {
  ToolRegistry,
  DomainGlossary,
  SemanticLayer,
  loadConfigOptional,
} from '@airflux/core';
import type { GlossaryConfig, SemanticLayerConfig } from '@airflux/core';
import { logger } from '../lib/logger.js';

export function registerAb180Tools(): void {
  // ─── Data query routing (Snowflake cost tiers) ──────────────────
  ToolRegistry.register('queryData', {
    description:
      '데이터 카탈로그 기반 테이블 라우팅 + SQL 생성. 비용 티어(tens→billions) 자동 선택. 질문에 맞는 최적 테이블과 SQL을 제안합니다.',
    inputSchema: z.object({
      question: z.string().describe('데이터 관련 질문 (예: "앱 123의 DAU 추이")'),
      appId: z.string().optional().describe('앱 ID (billions 테이블 필요 시 필수)'),
      dateRange: z
        .string()
        .optional()
        .describe('날짜 범위 (예: "최근 7일", "2026-04-01~2026-04-07")'),
    }),
    execute: async (input: unknown) => {
      const { question, appId, dateRange } = input as {
        question: string;
        appId?: string;
        dateRange?: string;
      };
      const needsBillions = /이벤트|event|client_events/i.test(question);
      const needsMillions = /API|inference|log/i.test(question);
      if ((needsBillions || needsMillions) && !appId) {
        return {
          error: '역질의 필요: billions/millions 테이블 사용을 위해 app_id를 지정해주세요.',
          suggestion: '예: "앱 123의 DAU 추이"',
        };
      }
      const tier = needsBillions
        ? 'billions'
        : needsMillions
          ? 'millions'
          : 'tens/hundreds';
      return {
        routing: {
          tier,
          requiresAppId: needsBillions || needsMillions,
          dateRange: dateRange || '미지정',
        },
        recommendation: `${tier} 테이블을 사용하여 "${question}" 분석을 수행합니다.`,
        note: 'Snowflake 연결 시 실제 SQL이 실행됩니다. 현재는 라우팅 결과만 반환합니다.',
      };
    },
  });

  // ─── Airflux docs + schema search (grep) ────────────────────────
  ToolRegistry.register('searchDocs', {
    description: 'Airflux 설계 문서, 스키마 파일, CLAUDE.md를 검색합니다.',
    inputSchema: z.object({
      query: z
        .string()
        .describe('검색 키워드 (예: "text-to-sql", "guardrail", "routing")'),
    }),
    execute: async (input: unknown) => {
      const { query } = input as { query: string };
      const { execSync } = await import('child_process');
      try {
        const results = execSync(
          `grep -rl "${query}" docs/design/ settings/ CLAUDE.md 2>/dev/null | head -10`,
          { encoding: 'utf-8', timeout: 5000, cwd: process.cwd() + '/../..' },
        ).trim();
        const files = results ? results.split('\n') : [];
        return { query, matchedFiles: files, count: files.length };
      } catch {
        return { query, matchedFiles: [], count: 0 };
      }
    },
  });

  // ─── Domain glossary (Airbridge Korean business terms) ──────────
  const glossaryConfig = loadConfigOptional<GlossaryConfig>('domain-glossary', {
    terms: {},
  });
  const glossary = new DomainGlossary(glossaryConfig);

  ToolRegistry.register('lookupTerm', {
    description:
      '도메인 용어를 조회합니다. 약어, 한국어 표현을 표준 용어로 변환 (DAU, 리텐션, 전환율 등)',
    inputSchema: z.object({
      term: z.string().describe('조회할 용어 (예: "DAU", "리텐션", "전환율")'),
    }),
    execute: async (input: unknown) => {
      const { term } = input as { term: string };
      const resolved = glossary.resolve(term);
      if (!resolved) {
        return { found: false, term, suggestion: '도메인 용어 사전에 없는 용어입니다.' };
      }
      return { found: true, ...resolved };
    },
  });

  ToolRegistry.register('findTermsInQuery', {
    description:
      '쿼리에서 도메인 용어를 자동으로 찾아 표준 용어와 설명을 반환합니다',
    inputSchema: z.object({
      query: z.string().describe('분석할 질문'),
    }),
    execute: async (input: unknown) => {
      const { query } = input as { query: string };
      const terms = glossary.resolveAll(query);
      return { found: terms.length, terms };
    },
  });

  // ─── Semantic layer (Airbridge Snowflake schema) ────────────────
  const semanticConfig = loadConfigOptional<SemanticLayerConfig>(
    'semantic-layer',
    { database: '', schema: '', tables: {}, metrics: {} },
  );
  const semanticLayer = new SemanticLayer(semanticConfig);

  ToolRegistry.register('getSemanticLayer', {
    description:
      '데이터 웨어하우스의 테이블/메트릭 스키마를 조회합니다. SQL 생성에 필요한 컨텍스트를 제공합니다.',
    inputSchema: z.object({}),
    execute: async () => ({
      database: semanticConfig.database,
      schema: semanticConfig.schema,
      tables: semanticLayer.listTables(),
      metrics: semanticLayer.listMetrics(),
      context: semanticLayer.toPromptContext(),
    }),
  });

  ToolRegistry.register('getTableSchema', {
    description: '특정 테이블의 컬럼 정보를 조회합니다',
    inputSchema: z.object({
      table: z.string().describe('테이블 이름 (예: "events", "users", "apps")'),
    }),
    execute: async (input: unknown) => {
      const { table } = input as { table: string };
      const def = semanticLayer.getTable(table);
      if (!def)
        return {
          found: false,
          error: `테이블 "${table}" 없음. 사용 가능: ${semanticLayer.listTables().join(', ')}`,
        };
      return { found: true, table, ...def };
    },
  });

  ToolRegistry.register('getMetricSQL', {
    description: '메트릭의 SQL 템플릿을 조회합니다 (DAU, MAU, revenue 등)',
    inputSchema: z.object({
      metric: z.string().describe('메트릭 이름 (예: "DAU", "MAU", "revenue")'),
    }),
    execute: async (input: unknown) => {
      const { metric } = input as { metric: string };
      const def = semanticLayer.getMetric(metric);
      if (!def)
        return {
          found: false,
          error: `메트릭 "${metric}" 없음. 사용 가능: ${semanticLayer.listMetrics().join(', ')}`,
        };
      return { found: true, metric, ...def };
    },
  });

  logger.info('AB180 tools registered', {
    count: 6,
    tools: ['queryData', 'searchDocs', 'lookupTerm', 'findTermsInQuery', 'getSemanticLayer', 'getTableSchema', 'getMetricSQL'],
  });
}

/**
 * True when this checkout has Airbridge-shaped configuration files
 * present. Used by bootstrap to conditionally call registerAb180Tools.
 */
export function hasAb180Config(settingsDir: string): boolean {
  const { existsSync } = require('node:fs') as typeof import('node:fs');
  const { join } = require('node:path') as typeof import('node:path');
  return (
    existsSync(join(settingsDir, 'semantic-layer.yaml')) ||
    existsSync(join(settingsDir, 'domain-glossary.yaml'))
  );
}
