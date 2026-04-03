/**
 * SQL Agent - Text-to-SQL 데이터 분석 에이전트
 *
 * 파이프라인: 질문 → Schema 선택 → SQL 생성 → Guardrail → 실행 → 해석 → 응답
 *
 * Montgomery 영감:
 * - SdkProcessor: Druid SQL 실행 + 결과 포맷팅 + 쿼리 투명성
 * - FindAppProcessor: 다중 테이블 조회 + 결과 통합
 * - FiveHundredProcessor: 앱별 쿼리 라우팅 + 에러 핸들링
 */

import Anthropic from '@anthropic-ai/sdk';
import { BaseAgent } from '../../core/base-agent';
import { AgentContext, AgentResult, AgentCapability } from '../../types/agent';
import { getLLMApiKey } from '../../utils/secrets';
import { Logger } from '../../utils/logger';
import { loadSemanticLayer, loadDomainGlossary, findMetric } from '../../utils/config-loader';

// LLM 클라이언트 캐싱 (Montgomery: client instance caching)
let cachedLLM: Anthropic | null = null;
async function getLLMClient(): Promise<Anthropic> {
  if (cachedLLM) return cachedLLM;
  const apiKey = await getLLMApiKey();
  cachedLLM = new Anthropic({ apiKey });
  return cachedLLM;
}

export class SqlAgent extends BaseAgent {
  name = 'sql-agent';
  description = 'Natural language to SQL query execution and interpretation';

  capability: AgentCapability = {
    name: 'sql-agent',
    description: '자연어 질문을 SQL로 변환하여 데이터를 조회하고 해석합니다',
    examples: [
      'DAU 알려줘',
      '지난주 대비 매출 변화',
      'SDK 버전별 이벤트 분포',
      '채널별 설치 수 Top 5',
    ],
    requiredDataSources: ['snowflake'],
  };

  async execute(context: AgentContext): Promise<AgentResult> {
    const logger = new Logger('sql-agent', context.traceId, context.userId);
    const startTime = Date.now();

    try {
      // 1. 진행 표시 (Montgomery: postInitialMessage 패턴)
      await this.sendProgress(context, '🔍 질문을 분석하고 있습니다...');

      // 2. SQL 생성 (LLM)
      const llm = await getLLMClient();
      const sqlResult = await logger.timed('sql_generation', () =>
        this.generateSQL(llm, context.question, context.explain)
      );

      if (!sqlResult.sql) {
        return this.createErrorResult('SQL 생성에 실패했습니다. 다른 표현으로 시도해주세요.', startTime, context);
      }

      logger.info('sql_generated', { sql: sqlResult.sql.slice(0, 200) });

      // 3. Guardrails 검증
      const guardResult = this.validateSQL(sqlResult.sql);
      if (!guardResult.pass) {
        logger.warn('guardrail_blocked', { reason: guardResult.reason });
        return this.createErrorResult(guardResult.reason!, startTime, context);
      }

      // 4. SQL 실행
      await this.sendProgress(context, '📊 데이터를 조회하고 있습니다...');
      const queryResult = await logger.timed('query_execution', () =>
        this.executeQuery(sqlResult.sql)
      );

      // 5. 빈 결과 처리 (Montgomery: "No app found" 패턴)
      if (queryResult.rows.length === 0) {
        return {
          summary: `${this.formatUserMention(context.userId)} 해당 조건에 맞는 데이터가 없습니다.`,
          confidence: 'high',
          sql: sqlResult.sql,
          followUpSuggestions: ['시간 범위를 넓혀보세요', '필터 조건을 확인해보세요'],
          metadata: this.createMetadata(startTime, context, false),
        };
      }

      // 6. 결과 해석 (LLM)
      const interpretation = await logger.timed('result_interpretation', () =>
        this.interpretResults(llm, context.question, sqlResult.sql, queryResult.rows, context.explain)
      );

      // 7. 결과 조합
      return {
        summary: `${this.formatUserMention(context.userId)} ${interpretation.answer}`,
        confidence: 'high',
        insights: interpretation.insights,
        sql: sqlResult.sql,
        dataFreshness: '데이터 기준: 시간별 업데이트 (Snowflake)',
        followUpSuggestions: interpretation.suggestions,
        exportData: queryResult.rows.length > 10 ? queryResult.rows : undefined,
        metadata: this.createMetadata(startTime, context, false),
      };

    } catch (error) {
      logger.error('sql_agent_error', error as Error);
      return this.createErrorResult(
        error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
        startTime, context
      );
    }
  }

  // ── SQL Generation ──

  // System prompt — Semantic Layer + Domain Glossary에서 동적 생성
  private buildSystemPrompt(): string {
    // Semantic Layer에서 메트릭 정의 로드
    let metricsSection = 'Available tables:\n';
    try {
      const { metrics } = loadSemanticLayer();
      for (const [key, m] of Object.entries(metrics)) {
        if (m.table) {
          metricsSection += `- ${m.table} → metric "${key}" (${m.name}), aliases: ${(m.aliases || []).join(', ')}\n`;
          if (m.preAggregatedColumn) metricsSection += `  Pre-aggregated column: ${m.preAggregatedColumn}\n`;
          if (m.dimensions) metricsSection += `  Dimensions: ${m.dimensions.join(', ')}\n`;
        }
      }
    } catch {
      // 설정 파일 로드 실패 시 하드코딩 폴백
      metricsSection += `- events.daily_active_users (date, app_name, platform, country, dau)\n`;
      metricsSection += `- attribution.install_events (install_date, app_name, channel, campaign, is_organic)\n`;
      metricsSection += `- billing.revenue (billing_month, app_name, plan_type, revenue_krw)\n`;
      metricsSection += `- events.raw_events (event_date, app_name, event_name, platform, sdk_version)\n`;
    }

    // Domain Glossary에서 용어 로드
    let glossarySection = '';
    try {
      const { terms } = loadDomainGlossary();
      if (terms.length > 0) {
        glossarySection = '\nDomain terms:\n' +
          terms.slice(0, 10).map(t => `- "${t.term}": ${t.definition}`).join('\n');
      }
    } catch { /* 무시 */ }

    return `You are a SQL expert for Snowflake. Generate a SELECT query based on the user's question.

${metricsSection}
${glossarySection}

Rules:
1. Only generate SELECT statements. No INSERT, UPDATE, DELETE, DROP.
2. Always include date/time column in WHERE clause for partition pruning.
3. Default time range: last 7 days (DATEADD(day, -7, CURRENT_DATE())).
4. Always include LIMIT (default 100 for non-aggregation queries).
5. Use Snowflake SQL syntax.
6. When a metric alias matches (e.g., "DAU" → daily_active_users), use the pre-aggregated column if available.`;
  }

  // Structured Output schema (Round 46 — 정규식 파싱 불필요)
  private static readonly SQL_GENERATION_TOOL = {
    name: 'generate_sql' as const,
    description: 'Generate a Snowflake SQL query for the user question',
    input_schema: {
      type: 'object' as const,
      properties: {
        sql: { type: 'string', description: 'The Snowflake SQL SELECT query' },
        tables_used: { type: 'array', items: { type: 'string' }, description: 'Tables referenced' },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Confidence level' },
      },
      required: ['sql', 'tables_used', 'confidence'],
    },
  };

  private async generateSQL(
    llm: Anthropic,
    question: string,
    explain: boolean
  ): Promise<{ sql: string; tablesUsed?: string[]; confidence?: string }> {
    // TODO: Schema RAG로 관련 테이블만 선택 (Round 4 설계)
    // TODO: Semantic Layer에서 메트릭 매칭 (Round 11 설계)

    const response = await llm.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      // Prompt Caching: system prompt에 cache_control 적용 (Round 46)
      system: [
        {
          type: 'text',
          text: this.buildSystemPrompt(),
          cache_control: { type: 'ephemeral' },  // 5분 캐시 → 90% 토큰 절감
        },
      ],
      // Structured Output: tool_use로 JSON 구조 강제 (Round 46)
      tools: [SqlAgent.SQL_GENERATION_TOOL],
      tool_choice: { type: 'tool', name: 'generate_sql' },
      messages: [{ role: 'user', content: question }],
    });

    // Structured Output 추출 (정규식 파싱 불필요!)
    const toolUseBlock = response.content.find(block => block.type === 'tool_use');
    if (toolUseBlock && toolUseBlock.type === 'tool_use') {
      const input = toolUseBlock.input as { sql: string; tables_used: string[]; confidence: string };
      return {
        sql: input.sql,
        tablesUsed: input.tables_used,
        confidence: input.confidence,
      };
    }

    // Fallback: text에서 SQL 추출 (tool_use 실패 시)
    const textBlock = response.content.find(block => block.type === 'text');
    const text = textBlock && textBlock.type === 'text' ? textBlock.text : '';
    const codeBlockMatch = text.match(/```sql\n?([\s\S]*?)```/);
    if (codeBlockMatch) {
      return { sql: codeBlockMatch[1].trim() };
    }

    return { sql: '' };
  }

  // ── Guardrails (core/guardrails 모듈 사용) ──

  private validateSQL(sql: string): { pass: boolean; reason?: string; autoFix?: string } {
    // ESM import (top-level에서 순환 참조 방지를 위해 지연 로딩)
    const { runGuardrails } = require('../../core/guardrails') as typeof import('../../core/guardrails');
    return runGuardrails(sql, { userId: 'system', userRole: 'analyst' });
  }

  // ── Query Execution (Snowflake DataSource 사용) ──

  private async executeQuery(sql: string): Promise<{ rows: any[]; columnNames: string[] }> {
    const { executeSnowflakeQuery } = await import('../../datasources/snowflake');
    const result = await executeSnowflakeQuery(sql);
    const columnNames = result.rows.length > 0 ? Object.keys(result.rows[0]) : [];
    return { rows: result.rows, columnNames };
  }

  // ── Result Interpretation ──

  private async interpretResults(
    llm: Anthropic,
    question: string,
    sql: string,
    rows: any[],
    explain: boolean
  ): Promise<{ answer: string; insights: string[]; suggestions: string[] }> {
    const systemPrompt = explain
      ? `You are a data analyst explaining results to a non-technical user.
         Explain what the numbers mean, why this query was used, and what actions to take.
         Use simple language and analogies. Write in Korean.`
      : `You are a concise data analyst. Answer the question based on query results.
         Be brief (2-3 sentences). Include key numbers. Write in Korean.
         Also provide 2-3 bullet point insights and 2 follow-up question suggestions.`;

    const response = await llm.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Question: ${question}\nSQL: ${sql}\nResults (${rows.length} rows): ${JSON.stringify(rows.slice(0, 20))}`,
      }],
    });

    const textBlock = response.content.find(block => block.type === 'text');
    const text = textBlock && textBlock.type === 'text' ? textBlock.text : '';

    // 간단 파싱 (추후 구조화된 출력으로 개선)
    return {
      answer: text.split('\n')[0] || text,
      insights: text.split('\n').filter(l => l.startsWith('•') || l.startsWith('-')).slice(0, 3),
      suggestions: ['시간 범위 변경', '다른 메트릭 조회'],
    };
  }

  // ── Helpers ──

  private createErrorResult(message: string, startTime: number, context: AgentContext): AgentResult {
    return {
      summary: `${this.formatUserMention(context.userId)} ⚠️ ${message}`,
      confidence: 'low',
      metadata: this.createMetadata(startTime, context, false),
    };
  }

  private createMetadata(startTime: number, context: AgentContext, cached: boolean): AgentResult['metadata'] {
    return {
      agentType: this.name,
      model: 'claude-sonnet-4-20250514',
      latencyMs: Date.now() - startTime,
      costUsd: 0, // TODO: 실제 토큰 사용량 기반 계산
      traceId: context.traceId,
      cached,
    };
  }
}
