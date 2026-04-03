# Operations Runbook

> 장애 대응, 롤백, 긴급 비활성화, 일상 운영 절차

## 1. 장애 대응 매트릭스

| 증상 | 원인 가능성 | 즉시 조치 | 근본 해결 |
|------|-----------|----------|----------|
| 모든 요청 실패 | Lambda 배포 오류 | SST rollback | 코드 수정 후 재배포 |
| 특정 에이전트만 실패 | LLM 모델 장애 | agents.yaml fallbackModel 활성화 | provider 복구 대기 |
| SQL 실행 에러 | Snowflake 장애/권한 | Snowflake 상태 확인 | DBA 연락 |
| 느려짐 (p95 > 30s) | LLM 지연 / 대량 쿼리 | 캐시 확인, 비용 guard 확인 | 모델 변경 or 쿼리 최적화 |
| 비용 급증 | 무한 루프 / 대량 요청 | 일일 예산으로 자동 차단됨 | 원인 쿼리 분석 |
| Guardrail bypass | 보안 취약점 | 해당 에이전트 즉시 비활성화 | guardrail 패턴 보강 |
| Slack 응답 안 됨 | Gateway Lambda 에러 | CloudWatch 로그 확인 | Slack 서명/토큰 확인 |

## 2. 긴급 에이전트 비활성화

코드 배포 없이 에이전트를 즉시 비활성화:

```yaml
# settings/agents.yaml — enabled: false로 변경
- name: insight
  enabled: false    # ← 비활성화
  # ... 나머지 설정 유지
```

Lambda cold start 또는 5분 캐시 만료 후 적용.
**즉시 적용 필요 시**: Lambda 재배포 (`npx sst deploy`).

### feature flag로 세밀한 제어

```yaml
# settings/feature-flags.yaml
insight_agent:
  enabled: true
  rolloutPercentage: 0    # ← 0%로 하면 아무도 못 씀
  allowedUsers: [U_ADMIN]  # 관리자만 테스트
```

## 3. 모델 긴급 전환

AI provider 장애 시:

```yaml
# settings/agents.yaml
- name: sql
  model: openai/gpt-5.4              # ← fallback 모델로 교체
  # fallbackModel: anthropic/claude-sonnet-4.6  # 원래 모델은 주석
```

또는 코드 변경 없이 AI Gateway의 자동 failover에 의존:
- AI Gateway가 provider 에러 감지 → 자동으로 fallback 라우팅
- `agents.yaml`의 `fallbackModel` 필드를 AI Gateway가 참조

## 4. 프롬프트 롤백

새 프롬프트 버전이 품질 저하를 일으킨 경우:

```yaml
# settings/prompts/sql-agent.yaml
versions:
  v2.0:
    current: true    # ← 이전 버전으로 되돌리기
  v2.1:
    current: false   # ← 문제 버전 비활성화
    deprecated: true
```

```yaml
# settings/agents.yaml
- name: sql
  promptVersion: v2.0    # ← 이전 버전으로 변경
```

## 5. 일일 운영 체크리스트

### 아침 (09:00)
- [ ] Cron 일일 평가 리포트 확인 (#airflux-alerts)
- [ ] 전일 비용 확인 (#airflux-costs)
- [ ] Golden dataset 점수 확인 (drift 없는지)

### 수시
- [ ] Negative 피드백 알림 확인 (3건/1시간 초과 시)
- [ ] 에러 알림 확인 (CloudWatch → SNS → Slack)

### 주간 (월요일)
- [ ] 주간 피드백 요약 리뷰
- [ ] Few-shot 후보 큐레이션 (verified: false → true 검증)
- [ ] Golden dataset 후보 검증 (negative 피드백에서 추가된 것)
- [ ] A/B 테스트 결과 분석 (진행 중인 실험)
- [ ] 비용 트렌드 확인 (주간 대비)

## 6. CloudWatch 디버깅

### 특정 요청 추적

```sql
-- traceId로 전체 흐름 추적
fields @timestamp, component, event, metadata
| filter traceId = 'abc-123-def'
| sort @timestamp asc
```

### 특정 사용자 문제 조사

```sql
-- userId로 최근 요청 조회
fields @timestamp, event, metadata.question, metadata.agent, level
| filter userId = 'U_USER_001'
| filter @timestamp > ago(24h)
| sort @timestamp desc
| limit 20
```

### Guardrail 트리거 내역

```sql
fields @timestamp, metadata.guard, metadata.reason, metadata.sql, userId
| filter event = 'guardrail_blocked'
| filter @timestamp > ago(7d)
| sort @timestamp desc
```

## 7. 배포 절차

### 일반 배포 (코드/설정 변경)

```bash
# 1. Golden dataset 평가 (CI에서 자동)
npm run eval

# 2. 배포
npx sst deploy --stage production

# 3. 배포 후 확인
# - Slack에서 테스트 쿼리 실행
# - CloudWatch 에러 없는지 확인
# - 5분 대기 후 캐시 갱신 확인
```

### 핫픽스 (긴급)

```bash
# 1. 설정만 변경하는 경우 (agents.yaml, feature-flags.yaml)
npx sst deploy --stage production
# 5분 내 적용 (캐시 TTL)

# 2. 코드 변경이 필요한 경우
git checkout -b hotfix/issue-name
# 수정 후
npx sst deploy --stage production
# Golden dataset safety 카테고리만 빠르게 실행
npm run eval -- --category safety
```

### 롤백

```bash
# SST는 CloudFormation 기반 — 이전 배포로 롤백
npx sst rollback --stage production

# 또는 이전 커밋으로 재배포
git checkout <previous-commit>
npx sst deploy --stage production
```

## 8. 비상 연락처

| 상황 | 담당 | 채널 |
|------|------|------|
| 에이전트 장애 | Airflux Agent 팀 | #airflux-alerts |
| Snowflake 장애 | Data Engineering | #data-eng |
| AI Gateway 장애 | — (자동 failover) | AI Gateway 대시보드 |
| Slack App 이슈 | Platform 팀 | #platform |
| 보안 이슈 | Security 팀 | #airflux-security |
