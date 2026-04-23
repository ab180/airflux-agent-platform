---
name: text-to-sql
description: "자연어를 SQL로 변환하여 Snowflake에서 실행"
requiredTools:
  - getSemanticLayer
  - executeSnowflakeQuery
  - formatResult
guardrails:
  - read-only
  - time-range
  - row-limit
  - pii-filter
  - cost-estimation
triggers:
  - select
  - 쿼리
  - DAU
  - MAU
  - 리텐션
---

# Text-to-SQL Skill

자연어 질의를 Snowflake SQL로 번역하고 실행하여 결과를 반환합니다.

## 작동 절차

1. `getSemanticLayer` 로 사용 가능한 테이블/메트릭을 확인합니다.
2. 읽기 전용 SELECT 문을 작성합니다. INSERT/UPDATE/DELETE 금지.
3. 기본 row limit 1000, 명시되지 않은 기간은 최근 30일로 제한합니다.
4. PII 컬럼은 자동 마스킹됩니다 (pii-filter guardrail).
5. 결과를 `formatResult` 로 표 형태로 렌더링합니다.

## 비용 관리

고비용 쿼리(풀 스캔, 큰 JOIN)는 `cost-estimation` guardrail 이 쿼리 플랜을
먼저 조회하여 사용자 승인을 요구합니다.
