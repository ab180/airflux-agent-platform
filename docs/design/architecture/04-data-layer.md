# Data Layer

> 데이터소스 연결, Semantic Layer, 캐싱 전략

## 데이터소스

| 소스 | 용도 | 접근 방식 |
|------|------|----------|
| Snowflake | Airflux 이벤트/분석 데이터 | snowflake-sdk, Connection Pool |
| MySQL (RDS) | 앱/계정 메타데이터 | mysql2, Montgomery 패턴 |
| Druid | 실시간 이벤트 집계 | HTTP API |
| Redis (Upstash) | 세션/캐시 | @upstash/redis |
| S3 | 리포트/이미지/CSV | @aws-sdk/s3 |

## Semantic Layer (핵심)

SQL Agent가 테이블/컬럼을 이해하기 위한 YAML 기반 시맨틱 레이어:

```yaml
# settings/semantic-layer.yaml
domains:
  events:
    description: "Airflux 이벤트 데이터"
    tables:
      - name: events
        schema: airflux
        description: "수집된 이벤트"
        columns:
          - name: app_id
            type: INTEGER
            description: "앱 ID"
            joins: "apps.id"
          - name: event_name
            type: VARCHAR
            description: "이벤트 이름 (e.g. purchase, sign_up)"
          - name: event_timestamp
            type: TIMESTAMP
            description: "이벤트 발생 시각 (UTC)"
          - name: user_id
            type: VARCHAR
            description: "사용자 식별자"
          - name: properties
            type: VARIANT
            description: "이벤트 속성 (JSON)"
    common_queries:
      - name: "일일 이벤트 수"
        sql: "SELECT DATE(event_timestamp) as dt, COUNT(*) as cnt FROM events WHERE app_id = ? GROUP BY dt ORDER BY dt"
      - name: "이벤트별 분포"
        sql: "SELECT event_name, COUNT(*) as cnt FROM events WHERE app_id = ? AND event_timestamp >= ? GROUP BY event_name ORDER BY cnt DESC"

  apps:
    description: "앱 메타데이터"
    tables:
      - name: apps
        schema: airflux
        columns:
          - name: id
            type: INTEGER
            description: "앱 고유 ID"
          - name: name
            type: VARCHAR
            description: "앱 이름"
          - name: subdomain
            type: VARCHAR
            description: "앱 서브도메인"
```

## 쿼리 캐싱 전략

```
요청 → Cache Key 생성 (SQL hash + params)
  ↓
Redis 조회 (TTL 5분)
  ├── HIT → 캐시 결과 반환
  └── MISS → Snowflake 실행 → Redis 저장 → 반환
```

```typescript
// 캐시 키: SQL 정규화 후 SHA256
function cacheKey(sql: string, params: any[]): string {
  const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
  return `query:${sha256(normalized + JSON.stringify(params))}`;
}

// TTL 전략
const CACHE_TTL = {
  realtime: 60,        // 실시간 데이터: 1분
  hourly: 300,         // 시간별 집계: 5분
  daily: 3600,         // 일별 집계: 1시간
  historical: 86400,   // 과거 데이터: 24시간
};
```

## Connection Management

Montgomery 패턴 (Credential Caching + Connection Pool + Reset on Error):

```typescript
// Snowflake — Lambda warm start에서 연결 재사용
let snowflakePool: SnowflakePool | null = null;

async function getSnowflakePool(): Promise<SnowflakePool> {
  if (snowflakePool) {
    try {
      await snowflakePool.ping();
      return snowflakePool;
    } catch {
      snowflakePool = null;  // Reset on Error
    }
  }
  const creds = await getCachedSecret('snowflake-credentials');  // TTL 5분
  snowflakePool = createPool(creds);
  return snowflakePool;
}
```
