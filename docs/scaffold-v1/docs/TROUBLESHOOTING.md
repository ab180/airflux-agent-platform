# Troubleshooting Guide

## 일반 문제

### "에이전트가 응답하지 않아요"
1. **Slack retry 확인**: CloudWatch Logs에서 `slack_retry_skipped` 검색
   - Slack이 3초 내 응답 못 받으면 재전송 → Gateway가 무시 중일 수 있음
2. **Worker 에러 확인**: CloudWatch Logs에서 `worker_error` 검색
3. **Lambda 타임아웃**: Gateway(3s) 또는 Worker(120s) 초과 여부

### "SQL이 잘못 생성돼요"
1. `debug:` 접두사로 재질문 → 어떤 스키마/SQL이 생성됐는지 확인
2. `settings/semantic-layer.yaml`에 관련 메트릭 정의가 있는지 확인
3. Golden Dataset에 유사 케이스 추가하여 eval 점수 확인

### "응답이 너무 느려요"
CloudWatch Logs Insights에서 병목 확인:
```
fields @timestamp, event, metadata.duration
| filter component = 'sql-agent'
| filter event like 'sql_generation' or event like 'query_execution' or event like 'result_interpretation'
| sort metadata.duration desc
| limit 20
```

### "비용이 높아요"
```
fields @timestamp, metadata.model, metadata.cost
| filter event like 'llm_call'
| stats sum(metadata.cost) as totalCost by metadata.model
| sort totalCost desc
```

### "Guardrail이 잘못 차단해요"
1. `settings/feature-flags.yaml`에서 guardrail 로그 확인
2. CloudWatch: `filter event = 'guardrail_blocked'`
3. False positive → guardrails/index.ts 규칙 조정

## CloudWatch Logs 유용한 쿼리

### 에러 TOP 10
```
fields @timestamp, error.code, error.message
| filter level = 'error'
| stats count() by error.code
| sort count desc
| limit 10
```

### 사용자별 사용량
```
fields @timestamp, userId
| filter event = 'worker_completed'
| stats count() as queries by userId
| sort queries desc
```

### 느린 요청 (5초 이상)
```
fields @timestamp, traceId, metadata.latencyMs, component
| filter event = 'agent_execution' and metadata.latencyMs > 5000
| sort metadata.latencyMs desc
```

### Guardrail 차단 현황
```
fields @timestamp, metadata.guard, metadata.reason
| filter event = 'guardrail_blocked'
| stats count() by metadata.guard
```

## 긴급 대응

### Lambda 에러 폭증 시
1. CloudWatch Alarm → SNS → Slack #airflux-alerts 확인
2. 최근 배포가 원인인지 확인: `npx sst info`
3. 롤백 필요 시: `git revert HEAD && npx sst deploy --stage production`

### LLM API 장애 시
- Circuit Breaker가 자동 발동 (설계됨, 구현은 Phase 2)
- 임시 조치: Worker Lambda 환경변수에서 모델 변경

### Snowflake 연결 실패 시
- Worker 로그에서 `snowflake_connect` 이벤트 확인
- `src/utils/secrets.ts`의 캐시 만료 확인 (5분 TTL)
