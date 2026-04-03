# Airflux Agent — Executive Summary

## What
Slack 네이티브 데이터 분석 AI 에이전트. 자연어 질문 → SQL 생성 → 실행 → 해석 → Slack 응답.

## Why
- 데이터 팀 의존 없이 누구나 데이터 접근
- SQL 몰라도, 대시보드 열지 않아도, Slack에서 바로 분석
- Montgomery(abot)에서 검증된 43개 패턴 기반

## Architecture
```
[Slack] → [Gateway Lambda 3s] → [Worker Lambda 120s] → [Snowflake/Druid]
                                       ↓
                                  [SQL Agent]
                                  LLM → SQL → Guardrails → Execute → Interpret
```

## Key Capabilities
| 기능 | 설명 | Phase |
|------|------|-------|
| Text-to-SQL | 자연어 → Snowflake SQL | Phase 1 |
| Query Transparency | 실행된 SQL 항상 공개 | Phase 1 |
| 대화형 Drill-down | 스레드에서 후속 질문 | Phase 1 |
| 5 Guardrails | READ-only, 시간범위, LIMIT, PII, 비용 | Phase 1 |
| 차트 생성 | 서버사이드 렌더링 | Phase 2 |
| 인사이트 | 자동 이상 탐지 + 원인 분석 | Phase 2 |
| 스마트 알림 | 자연어로 모니터링 등록 | Phase 3 |

## Safety
- READ-only (데이터 수정 불가)
- PII 자동 마스킹
- 쿼리 비용 제한 + 사용자별 예산
- Slack 서명 검증
- 감사 로그

## Timeline
- **Phase 1** (6주): MVP → 파일럿 5명 → 전체 배포
- **Phase 2** (6주): 차트 + 인사이트 + 메모리
- **Phase 3** (6주): 알림 + 리포트 + A/B 테스트

## Success Metrics
- SQL 정확도 ≥ 92%
- 사용자 만족도 ≥ 87%
- 평균 응답 ≤ 5초
- MAU ≥ 30명
- 월 LLM 비용 ≤ $500

## Foundation
- Montgomery(abot) 43개 패턴 학습, ~60% 코드 재활용
- 44라운드 반복 분석, 11,200+ 줄 설계문서
- 31개 파일, 2,944줄 즉시 실행 가능한 스캐폴드
