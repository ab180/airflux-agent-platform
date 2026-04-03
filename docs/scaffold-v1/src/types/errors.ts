/**
 * Airflux Error Codes (Round 21 설계)
 *
 * Montgomery 영감: github/errors.ts의 isGitHubAuthError (의미론적 에러 분류)
 * 구조: DOMAIN-CATEGORY-NUMBER
 */

export const ERROR_CODES = {
  'SQL-GEN-001': { message: 'SQL 생성 실패', userMessage: '질문을 SQL로 변환하지 못했습니다. 다른 표현으로 시도해주세요.', severity: 'warn' },
  'SQL-GEN-002': { message: 'Schema 매칭 실패', userMessage: '관련 테이블을 찾지 못했습니다.', severity: 'warn' },
  'SQL-EXEC-001': { message: '쿼리 실행 타임아웃', userMessage: '쿼리가 너무 오래 걸립니다. 시간 범위를 좁혀주세요.', severity: 'error' },
  'SQL-EXEC-002': { message: '접근 권한 없음', userMessage: '이 데이터에 접근 권한이 없습니다.', severity: 'warn' },
  'SQL-EXEC-003': { message: '빈 결과', userMessage: '해당 조건에 맞는 데이터가 없습니다.', severity: 'info' },
  'LLM-API-001': { message: 'LLM API 호출 실패', userMessage: '분석 서비스에 문제가 있습니다. 잠시 후 다시 시도해주세요.', severity: 'error' },
  'LLM-API-002': { message: 'Rate limit 초과', userMessage: '요청이 많아 잠시 대기 중입니다.', severity: 'warn' },
  'LLM-PARSE-001': { message: 'LLM 응답 파싱 실패', userMessage: '응답 처리에 실패했습니다. 다시 시도해주세요.', severity: 'error' },
  'GUARD-RO-001': { message: 'Write operation 감지', userMessage: '데이터 수정은 실행할 수 없습니다.', severity: 'warn' },
  'GUARD-COST-001': { message: '비용 임계값 초과', userMessage: '쿼리 비용이 높습니다. 범위를 좁혀주세요.', severity: 'warn' },
  'GUARD-PII-001': { message: 'PII 접근 시도', userMessage: '개인정보에 접근할 수 없습니다.', severity: 'critical' },
  'AUTH-RBAC-001': { message: '역할 기반 접근 거부', userMessage: '접근 권한이 없습니다.', severity: 'warn' },
  'AUTH-BUDGET-001': { message: '일일 예산 초과', userMessage: '오늘의 분석 예산이 소진되었습니다.', severity: 'warn' },
  'SLK-RATE-001': { message: 'Slack rate limit', userMessage: '메시지 전송이 지연되고 있습니다.', severity: 'warn' },
  'SLK-SIZE-001': { message: '메시지 크기 초과', userMessage: '결과가 너무 큽니다. 요약 버전을 표시합니다.', severity: 'info' },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export class AirfluxError extends Error {
  public readonly code: ErrorCode;
  public readonly severity: string;
  public readonly userMessage: string;

  constructor(code: ErrorCode, context?: Record<string, any>) {
    const def = ERROR_CODES[code];
    super(def.message);
    this.name = 'AirfluxError';
    this.code = code;
    this.severity = def.severity;
    this.userMessage = def.userMessage;
    if (context) {
      (this as any).context = context;
    }
  }
}

/** Montgomery: isGitHubAuthError 패턴 — 에러 의미론적 분류 */
export function isQueryError(error: unknown): error is AirfluxError {
  return error instanceof AirfluxError && error.code.startsWith('SQL-');
}

export function isLLMError(error: unknown): error is AirfluxError {
  return error instanceof AirfluxError && error.code.startsWith('LLM-');
}

export function isGuardrailError(error: unknown): error is AirfluxError {
  return error instanceof AirfluxError && error.code.startsWith('GUARD-');
}
