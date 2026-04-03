# Technical Decisions Log

> 주요 기술 결정과 그 이유

## TD-001: AI Gateway (OIDC) vs Direct Provider SDK

**결정**: AI Gateway 사용

**이유**:
- API 키 관리 불필요 (OIDC 토큰 자동 갱신)
- Provider failover (Anthropic 장애 시 OpenAI로 자동 전환)
- 비용 추적 내장
- 모델 변경 시 코드 수정 불필요 (`'anthropic/claude-sonnet-4.6'` → 문자열만 교체)

**대안**: `@ai-sdk/anthropic` 직접 사용 → 거부. 키 관리 부담, failover 직접 구현 필요.

## TD-002: SST v3 (Lambda) vs Vercel Functions

**결정**: SST v3 유지

**이유**:
- Montgomery에서 검증된 VPC 접근 패턴 (Snowflake, RDS)
- 15분 timeout (Vercel Functions 최대 300s)
- Lambda → Lambda invoke 패턴 활용
- AB180 인프라(AWS) 친화적

**대안**: Vercel Functions + Fluid Compute → 고려 가능하나, VPC 피어링 복잡도 증가.

## TD-003: Multi-endpoint Architecture vs Slack-only

**결정**: Multi-endpoint

**이유**:
- PM 대시보드 자연어 쿼리 요구사항
- Cron 기반 자동 리포트 필요
- MCP Server로 개발자 도구 연동
- `ResponseChannel` 추상화로 에이전트 코드 변경 없이 엔드포인트 추가

## TD-004: AI SDK 6 Agent class vs 직접 Tool Loop

**결정**: AI SDK 6 Agent class

**이유**:
- `stopWhen`, `prepareStep` 등 내장 제어
- Subagent 패턴 지원
- MCP-aligned tool 스키마 (`inputSchema`/`outputSchema`)
- DurableAgent (WDK)로 쉽게 전환

**대안**: 직접 `while` 루프 + `streamText` → 거부. 재시도/제어 로직 직접 구현 필요.

## TD-005: Chat SDK vs 직접 Slack WebClient

**결정**: Phase 4에서 Chat SDK 도입 (초기에는 WebClient)

**이유**:
- Phase 1-3: Slack만 지원, WebClient로 충분
- Phase 4: Teams/Discord 확장 시 Chat SDK 도입
- Chat SDK의 Card JSX → 멀티 플랫폼 렌더링 유용

## TD-006: QuickChart vs Gemini Image vs Chart.js Server

**결정**: QuickChart (기본) + Gemini Image (고급)

**이유**:
- QuickChart: URL 기반, 100ms 이내, Slack unfurl 지원
- Gemini 3.1 Flash: 커스텀 인포그래픽, 한국어 레이블
- Chart.js SSR: 서버 사이드 렌더링 복잡도 높음 → 거부

## TD-007: Redis vs DynamoDB vs In-memory (세션)

**결정**: Upstash Redis

**이유**:
- Lambda 재시작에도 세션 유지
- TTL 기반 자동 만료
- Chat SDK state adapter로도 사용 가능
- Vercel Marketplace 통합 (향후 필요 시)

**대안**: DynamoDB → 가능하나 Redis가 더 간단. In-memory → Lambda cold start 시 유실.

## TD-008: Workflow DevKit vs Step Functions vs 직접 구현

**결정**: WDK (DurableAgent)

**이유**:
- TypeScript-native (YAML 불필요)
- `'use step'` 디렉티브로 자동 재시도/격리
- AI SDK Agent와 자연스럽게 통합
- 오픈소스, 벤더 종속 없음

**대안**: AWS Step Functions → JSON/YAML 정의 번거로움. 직접 구현 → 상태 관리 복잡.
