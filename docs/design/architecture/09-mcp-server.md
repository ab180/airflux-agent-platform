# MCP Server Design

> Claude Code 및 외부 AI 에이전트에서 Airflux 데이터에 접근하는 MCP 서버

## 1. 목적

개발자가 Claude Code에서 직접:
```
"airflux에서 앱 123의 어제 DAU 조회해줘"
"이 앱의 이벤트 스키마 보여줘"
"지난 주 이상치 있는 앱 찾아줘"
```

## 2. 아키텍처

```
Claude Code / AI Client
  ↓ MCP Protocol (Streamable HTTP)
Airflux MCP Server (Lambda)
  ↓ 내부 호출
Airflux Agent Core (SQL/Insight Agent 재사용)
  ↓
Snowflake / MySQL
```

MCP Server는 **별도 Lambda**가 아니라 기존 API Gateway 엔드포인트에 MCP 핸들러를 추가하거나, 별도의 경량 서버로 구성.

## 3. MCP Tools 정의

```typescript
// Airflux MCP Server — 5개 도구
const tools = {
  query_airflux: {
    description: '자연어로 Airflux 데이터를 조회합니다. SQL을 자동 생성하여 실행합니다.',
    inputSchema: z.object({
      question: z.string().describe('한국어 또는 영어 자연어 질문'),
      appId: z.number().optional().describe('특정 앱 ID로 범위 제한'),
      timeRange: z.string().optional().describe('시간 범위 (e.g. "7d", "30d")'),
    }),
    // 내부적으로 SQL Agent 호출
  },

  get_app_info: {
    description: '앱의 기본 정보를 조회합니다 (이름, subdomain, 생성일, 상태).',
    inputSchema: z.object({
      appId: z.number().optional(),
      subdomain: z.string().optional(),
    }),
  },

  get_schema: {
    description: 'Airflux 데이터 웨어하우스의 테이블/컬럼 스키마를 조회합니다.',
    inputSchema: z.object({
      domain: z.string().optional().describe('도메인 필터 (events, apps, billing)'),
    }),
    // Semantic Layer YAML 반환
  },

  analyze_anomalies: {
    description: '지정 기간의 이상치를 분석합니다.',
    inputSchema: z.object({
      appId: z.number().optional(),
      timeRange: z.string().default('7d'),
      sensitivity: z.enum(['low', 'medium', 'high']).default('medium'),
    }),
    // Insight Agent 호출
  },

  get_metric: {
    description: '특정 메트릭의 현재 값을 조회합니다 (DAU, MAU, revenue 등).',
    inputSchema: z.object({
      metric: z.string().describe('메트릭 이름 (dau, mau, revenue, event_count 등)'),
      appId: z.number().optional(),
      timeRange: z.string().default('7d'),
    }),
  },
};
```

## 4. MCP Resources

```typescript
// 읽기 전용 리소스
const resources = {
  'airflux://semantic-layer': {
    description: 'Airflux Semantic Layer (메트릭, 테이블, 컬럼 매핑)',
    mimeType: 'application/yaml',
    // settings/semantic-layer.yaml 내용 반환
  },

  'airflux://glossary': {
    description: '도메인 용어 사전',
    mimeType: 'application/yaml',
    // settings/domain-glossary.yaml 내용 반환
  },

  'airflux://app/{appId}/summary': {
    description: '앱별 요약 정보 (최근 7일 기본 지표)',
    mimeType: 'application/json',
  },
};
```

## 5. 인증

```typescript
// MCP OAuth 2.1 — 내부 서비스 인증
// Claude Code 설정:
// claude mcp add --transport http airflux https://airflux-mcp.internal.ab180.co

// 서버 측: Bearer Token 검증
async function authenticateMcpRequest(req: Request): Promise<McpAuth> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  // 내부 서비스 토큰 검증
  const valid = await verifyInternalToken(token);
  if (!valid) throw new Error('Unauthorized');
  return { userId: valid.userId, role: 'analyst' };
}
```

## 6. Guardrail 적용

MCP 도구도 동일한 guardrail 체인을 통과:
- READ-ONLY 강제
- PII 필터
- 비용 제한 (MCP 호출도 일일 예산에 포함)
- Rate limiting (분당 30 요청)

## 7. 설계 결정 이유

| 결정 | 이유 |
|------|------|
| 기존 Agent Core 재사용 | MCP 전용 로직 작성 불필요 — SQL/Insight Agent가 이미 존재 |
| 5개 도구 | 가장 빈번한 사용 시나리오만 — 도구 많으면 LLM 선택 품질 저하 |
| Resources로 스키마 제공 | AI가 도구 호출 전에 스키마를 참조하여 더 정확한 질문 구성 |
| 내부 전용 | 초기에는 internal.ab180.co — 외부 공개는 Phase 4+ |
