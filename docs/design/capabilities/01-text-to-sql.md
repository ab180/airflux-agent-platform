# Text-to-SQL Capability

> 자연어 → SQL 변환 → 실행 → 결과 포맷팅

## 파이프라인

```
자연어 질문
  ↓
Semantic Layer 로딩 (관련 도메인 선택)
  ↓
LLM: SQL 생성 (Claude Sonnet)
  ↓
Guardrails 검증
  ├── READ-ONLY 체크 (SELECT/WITH만 허용)
  ├── 비용 예측 (EXPLAIN)
  ├── PII 컬럼 접근 체크
  └── 테이블 접근 권한 체크
  ↓
Snowflake 실행
  ↓
결과 포맷팅 (테이블/요약/CSV)
  ↓
ResponseChannel로 전달
```

## Guardrails

```typescript
// 1. READ-ONLY 강제
function isReadOnly(sql: string): boolean {
  const forbidden = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|MERGE)\b/i;
  return !forbidden.test(sql);
}

// 2. 비용 예측
async function estimateQueryCost(sql: string): Promise<number> {
  const explain = await snowflake.execute(`EXPLAIN ${sql}`);
  return parseEstimatedCost(explain);
}

// 3. PII 컬럼 차단
const PII_COLUMNS = ['email', 'phone', 'ip_address', 'device_id'];
function hasPiiAccess(sql: string): boolean {
  return PII_COLUMNS.some(col => sql.toLowerCase().includes(col));
}
```

## Golden Query Dataset

검증용 golden query 20 → 50개 확장 계획:

```yaml
# settings/golden-queries.yaml
- question: "앱 123의 지난 7일 일별 이벤트 수"
  expected_sql: |
    SELECT DATE(event_timestamp) as dt, COUNT(*) as cnt
    FROM airflux.events
    WHERE app_id = 123
      AND event_timestamp >= DATEADD(day, -7, CURRENT_DATE())
    GROUP BY dt ORDER BY dt
  expected_columns: [dt, cnt]
  tags: [basic, time-series]

- question: "가장 많은 이벤트를 발생시킨 앱 상위 10개"
  expected_sql: |
    SELECT a.name, a.id, COUNT(*) as event_count
    FROM airflux.events e
    JOIN airflux.apps a ON e.app_id = a.id
    WHERE e.event_timestamp >= DATEADD(day, -30, CURRENT_DATE())
    GROUP BY a.name, a.id
    ORDER BY event_count DESC LIMIT 10
  expected_columns: [name, id, event_count]
  tags: [join, ranking]
```

## 에러 처리

| 에러 코드 | 상황 | 사용자 메시지 |
|----------|------|-------------|
| SQL-GEN-001 | SQL 생성 실패 | "질문을 SQL로 변환하지 못했습니다" |
| SQL-GEN-002 | 스키마 매칭 실패 | "관련 테이블을 찾지 못했습니다" |
| SQL-EXEC-001 | 타임아웃 | "쿼리가 너무 오래 걸립니다" |
| SQL-EXEC-003 | 빈 결과 | "해당 조건에 맞는 데이터가 없습니다" |
| GUARD-RO-001 | 쓰기 시도 | "데이터 수정은 실행할 수 없습니다" |
| GUARD-COST-001 | 고비용 쿼리 | "쿼리 비용이 높습니다. 범위를 좁혀주세요" |
