/**
 * Query Guardrails System (Round 3 설계)
 *
 * 5가지 안전 장치:
 * 1. read-only: 쓰기 작업 차단
 * 2. time-range: 최대 90일 범위 제한
 * 3. row-limit: LIMIT 절 강제
 * 4. pii-filter: 개인정보 칼럼 차단
 * 5. cost-estimation: 비용 임계값 초과 차단
 */

import { Logger } from '../../utils/logger';

const logger = new Logger('guardrails');

export interface GuardrailResult {
  pass: boolean;
  reason?: string;
  suggestion?: string;
  autoFix?: string;  // 자동 수정 SQL
}

export interface GuardrailContext {
  userId: string;
  userRole: string;
  costThreshold?: number;
}

interface Guardrail {
  name: string;
  validate: (sql: string, context: GuardrailContext) => GuardrailResult;
}

// ── Guardrail Definitions ──

const readOnlyGuard: Guardrail = {
  name: 'read-only',
  validate: (sql) => {
    const forbidden = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'CREATE', 'MERGE'];
    const upper = sql.toUpperCase();
    for (const keyword of forbidden) {
      // 단어 경계 매칭 (CREATED_AT 등 오탐 방지)
      const regex = new RegExp(`\\b${keyword}\\b`);
      if (regex.test(upper)) {
        return { pass: false, reason: `데이터 수정 작업은 실행할 수 없습니다 (${keyword} 감지).` };
      }
    }
    return { pass: true };
  },
};

const timeRangeGuard: Guardrail = {
  name: 'time-range',
  validate: (sql) => {
    // DATEADD(day, -N, ...) 패턴에서 N 추출
    const dateAddMatch = sql.match(/DATEADD\s*\(\s*day\s*,\s*-(\d+)/i);
    if (dateAddMatch) {
      const days = parseInt(dateAddMatch[1]);
      if (days > 90) {
        return {
          pass: false,
          reason: `쿼리 범위가 ${days}일로 90일 제한을 초과합니다.`,
          suggestion: '90일 이내로 범위를 좁혀주세요.',
        };
      }
    }
    return { pass: true };
  },
};

const rowLimitGuard: Guardrail = {
  name: 'row-limit',
  validate: (sql) => {
    const upper = sql.toUpperCase();
    // 집계 쿼리는 LIMIT 불필요
    const isAggregation = upper.includes('GROUP BY') || upper.includes('COUNT(') || upper.includes('SUM(');
    if (isAggregation) return { pass: true };

    if (!upper.includes('LIMIT')) {
      return {
        pass: false,
        reason: 'LIMIT 절이 없습니다.',
        autoFix: sql.replace(/;?\s*$/, '\nLIMIT 1000'),
      };
    }

    // LIMIT 값이 너무 크면 경고
    const limitMatch = upper.match(/LIMIT\s+(\d+)/);
    if (limitMatch && parseInt(limitMatch[1]) > 10000) {
      return {
        pass: false,
        reason: `LIMIT ${limitMatch[1]}은 너무 큽니다.`,
        suggestion: 'LIMIT 1000 이하로 줄여주세요.',
      };
    }
    return { pass: true };
  },
};

const piiFilterGuard: Guardrail = {
  name: 'pii-filter',
  validate: (sql) => {
    const upper = sql.toUpperCase();
    const piiPatterns = [
      { column: 'EMAIL', pattern: /\bEMAIL\b/ },
      { column: 'PHONE', pattern: /\bPHONE\b/ },
      { column: 'ADDRESS', pattern: /\bADDRESS\b/ },
      { column: 'SSN', pattern: /\bSSN\b/ },
      { column: 'PASSWORD', pattern: /\bPASSWORD\b/ },
    ];

    for (const { column, pattern } of piiPatterns) {
      if (pattern.test(upper)) {
        // COUNT(DISTINCT email) 같은 집계는 허용
        const hasAggregation = upper.includes(`COUNT(`) || upper.includes(`COUNT (DISTINCT`);
        if (!hasAggregation) {
          return {
            pass: false,
            reason: `개인정보 보호 정책에 따라 ${column} 칼럼에 직접 접근할 수 없습니다.`,
            suggestion: `집계 함수(COUNT, COUNT DISTINCT)를 사용하세요.`,
          };
        }
      }
    }
    return { pass: true };
  },
};

const costEstimationGuard: Guardrail = {
  name: 'cost-estimation',
  validate: (sql, context) => {
    if (!context.costThreshold) return { pass: true };

    // 간단 휴리스틱: 넓은 범위 + 큰 테이블 = 높은 비용
    const upper = sql.toUpperCase();
    const hasWildcard = upper.includes('SELECT *');
    const dateAddMatch = sql.match(/DATEADD\s*\(\s*day\s*,\s*-(\d+)/i);
    const days = dateAddMatch ? parseInt(dateAddMatch[1]) : 7;
    const hitsBigTable = upper.includes('RAW_EVENTS');

    // 추정 비용 (매우 간단한 모델, 추후 Snowflake EXPLAIN으로 교체)
    let estimatedCost = 0.001; // 기본 $0.001
    if (hitsBigTable) estimatedCost *= 10;
    if (days > 30) estimatedCost *= (days / 30);
    if (hasWildcard) estimatedCost *= 2;

    if (estimatedCost > context.costThreshold) {
      return {
        pass: false,
        reason: `예상 비용이 $${estimatedCost.toFixed(3)}으로 임계값 $${context.costThreshold}을 초과합니다.`,
        suggestion: '시간 범위를 줄이거나 특정 칼럼만 선택하세요.',
      };
    }
    return { pass: true };
  },
};

// ── Guardrail Runner ──

const ALL_GUARDRAILS: Guardrail[] = [
  readOnlyGuard,
  timeRangeGuard,
  rowLimitGuard,
  piiFilterGuard,
  costEstimationGuard,
];

export function runGuardrails(sql: string, context: GuardrailContext): GuardrailResult {
  for (const guard of ALL_GUARDRAILS) {
    const result = guard.validate(sql, context);
    if (!result.pass) {
      logger.warn('guardrail_blocked', { guard: guard.name, reason: result.reason });

      // autoFix가 있으면 수정된 SQL로 재검증
      if (result.autoFix) {
        const retryResult = runGuardrails(result.autoFix, context);
        if (retryResult.pass) {
          return { pass: true, autoFix: result.autoFix };
        }
      }

      return result;
    }
  }
  return { pass: true };
}
