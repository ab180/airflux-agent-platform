# Semantic Layer Synchronization

> Snowflake 스키마 변경 시 semantic-layer.yaml 자동/반자동 동기화

## 1. 문제

Snowflake에 새 테이블/컬럼이 추가되거나 변경되면, semantic-layer.yaml이 구식이 됨.
SQL Agent가 존재하지 않는 컬럼을 참조하거나, 새 테이블을 모르는 상황 발생.

## 2. 동기화 전략: 반자동 (Detect → Suggest → Human Review)

완전 자동은 위험 (잘못된 description, alias가 프롬프트 오염). 반자동이 적합.

```
Cron (주 1회)
  ↓
Snowflake INFORMATION_SCHEMA 조회
  ↓
현재 semantic-layer.yaml과 diff
  ↓
변경 감지:
  ├── 새 테이블 → "추가 제안" 생성
  ├── 새 컬럼 → "컬럼 추가 제안" 생성
  ├── 삭제된 컬럼 → "제거 경고" 생성
  └── 타입 변경 → "타입 변경 경고" 생성
  ↓
Slack 알림 (#airflux-schema-changes)
  ↓
개발자가 검토 → semantic-layer.yaml 수정 → 배포
```

## 3. 스키마 탐색 쿼리

```sql
-- Snowflake INFORMATION_SCHEMA에서 현재 스키마 조회
SELECT
  table_schema,
  table_name,
  column_name,
  data_type,
  comment as column_comment
FROM information_schema.columns
WHERE table_schema IN ('AIRFLUX', 'BILLING', 'ATTRIBUTION')
  AND table_name NOT LIKE '%_TEMP%'
  AND table_name NOT LIKE '%_BACKUP%'
ORDER BY table_schema, table_name, ordinal_position;
```

## 4. Diff 로직

```typescript
interface SchemaDiff {
  newTables: Array<{ schema: string; table: string; columns: Column[] }>;
  newColumns: Array<{ table: string; column: Column }>;
  removedColumns: Array<{ table: string; column: string }>;
  typeChanges: Array<{ table: string; column: string; oldType: string; newType: string }>;
}

async function detectSchemaDrift(): Promise<SchemaDiff> {
  // 1. Snowflake에서 현재 스키마 조회
  const currentSchema = await snowflake.execute(SCHEMA_QUERY);

  // 2. semantic-layer.yaml의 테이블/컬럼 추출
  const semanticLayer = loadSemanticLayer();
  const knownTables = extractKnownTables(semanticLayer);

  // 3. Diff 계산
  const diff: SchemaDiff = {
    newTables: [],
    newColumns: [],
    removedColumns: [],
    typeChanges: [],
  };

  for (const row of currentSchema) {
    const tableKey = `${row.table_schema}.${row.table_name}`;
    if (!knownTables.has(tableKey)) {
      diff.newTables.push({ schema: row.table_schema, table: row.table_name, columns: [] });
    } else {
      const known = knownTables.get(tableKey);
      if (!known.columns.includes(row.column_name)) {
        diff.newColumns.push({ table: tableKey, column: row });
      }
    }
  }

  // 삭제된 컬럼 감지 (semantic-layer에 있지만 Snowflake에 없는 것)
  for (const [table, meta] of knownTables) {
    for (const col of meta.columns) {
      if (!currentSchema.find(r => `${r.table_schema}.${r.table_name}` === table && r.column_name === col)) {
        diff.removedColumns.push({ table, column: col });
      }
    }
  }

  return diff;
}
```

## 5. 알림 포맷

```
📋 Semantic Layer 스키마 변경 감지 (주간)

🆕 새 테이블 1개:
  • AIRFLUX.USER_SEGMENTS (12 컬럼)

🆕 새 컬럼 3개:
  • AIRFLUX.EVENTS.platform_version (VARCHAR)
  • AIRFLUX.EVENTS.session_duration (NUMBER)
  • BILLING.REVENUE.discount_amount (NUMBER)

⚠️ 삭제된 컬럼 1개:
  • AIRFLUX.EVENTS.legacy_id (semantic-layer에서 제거 필요)

💡 semantic-layer.yaml 업데이트가 필요합니다.
  변경 후 Golden Dataset 재평가를 실행하세요.
```

## 6. LLM 활용 description 자동 생성

새 테이블/컬럼의 description을 LLM이 제안:

```typescript
async function suggestDescription(table: string, column: string, type: string, existingContext: string): Promise<string> {
  const result = await generateText({
    model: 'anthropic/claude-haiku-4.5',
    prompt: `
      Snowflake 테이블 ${table}의 컬럼 "${column}" (타입: ${type})에 대한
      한국어 설명을 1줄로 작성하세요.
      기존 테이블 컨텍스트: ${existingContext}
    `,
  });
  return result.text.trim();
}
```

제안된 description은 Slack 알림에 포함되어 개발자가 검토/수정 후 반영.

## 7. 설계 결정 이유

| 결정 | 이유 |
|------|------|
| 반자동 (자동 감지 + 수동 반영) | 완전 자동은 잘못된 alias/description 위험 |
| 주 1회 Cron | 스키마 변경은 빈번하지 않음 — 실시간 불필요 |
| LLM으로 description 제안 | 빈 description보다 제안이 나음 — 검토 후 수정 |
| 삭제 컬럼 경고 | SQL Agent가 없는 컬럼을 참조하면 실행 에러 |
