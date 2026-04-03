# Error Codes Reference

> AirfluxError 구조화 에러 코드. 구현: scaffold/src/types/errors.ts

## 코드 체계

`DOMAIN-CATEGORY-NUMBER`

| Domain | 설명 |
|--------|------|
| SQL | SQL 생성/실행 관련 |
| LLM | LLM API 호출 관련 |
| GUARD | Guardrail 관련 |
| AUTH | 인증/권한 관련 |
| SLK | Slack 통신 관련 |

## 전체 코드 목록

| 코드 | severity | 시스템 메시지 | 사용자 메시지 |
|------|----------|-------------|-------------|
| SQL-GEN-001 | warn | SQL 생성 실패 | 질문을 SQL로 변환하지 못했습니다 |
| SQL-GEN-002 | warn | Schema 매칭 실패 | 관련 테이블을 찾지 못했습니다 |
| SQL-EXEC-001 | error | 쿼리 실행 타임아웃 | 쿼리가 너무 오래 걸립니다 |
| SQL-EXEC-002 | warn | 접근 권한 없음 | 이 데이터에 접근 권한이 없습니다 |
| SQL-EXEC-003 | info | 빈 결과 | 해당 조건에 맞는 데이터가 없습니다 |
| LLM-API-001 | error | LLM API 호출 실패 | 분석 서비스에 문제가 있습니다 |
| LLM-API-002 | warn | Rate limit 초과 | 요청이 많아 잠시 대기 중입니다 |
| LLM-PARSE-001 | error | LLM 응답 파싱 실패 | 응답 처리에 실패했습니다 |
| GUARD-RO-001 | warn | Write operation 감지 | 데이터 수정은 실행할 수 없습니다 |
| GUARD-COST-001 | warn | 비용 임계값 초과 | 쿼리 비용이 높습니다 |
| GUARD-PII-001 | critical | PII 접근 시도 | 개인정보에 접근할 수 없습니다 |
| AUTH-RBAC-001 | warn | 역할 기반 접근 거부 | 접근 권한이 없습니다 |
| AUTH-BUDGET-001 | warn | 일일 예산 초과 | 오늘의 분석 예산이 소진되었습니다 |
| SLK-RATE-001 | warn | Slack rate limit | 메시지 전송이 지연되고 있습니다 |
| SLK-SIZE-001 | info | 메시지 크기 초과 | 결과가 너무 큽니다 |

## 사용법

```typescript
import { AirfluxError, isQueryError, isGuardrailError } from './types/errors';

// 에러 생성
throw new AirfluxError('GUARD-RO-001');
throw new AirfluxError('SQL-EXEC-001', { sql, timeout: 30000 });

// 에러 분류
if (isQueryError(error)) { /* SQL 관련 에러 처리 */ }
if (isGuardrailError(error)) { /* 보안 관련 에러 처리 */ }

// 사용자 메시지 (ResponseChannel에서 자동 사용)
const userText = error instanceof AirfluxError
  ? error.userMessage
  : '처리 중 오류가 발생했습니다';
```
