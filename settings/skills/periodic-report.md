---
name: periodic-report
description: "정기 리포트 생성 및 전달"
requiredTools:
  - executeSnowflakeQuery
  - generateQuickChart
  - uploadToS3
  - postSlackMessage
guardrails:
  - read-only
  - cost-estimation
triggers:
  - 리포트
  - report
  - 주간
  - 일간
  - 월간
---

# Periodic Report Skill

정기적으로 실행되어 리포트를 생성하고 Slack 에 발송합니다. 스케줄 기반
에이전트가 주로 소비합니다.

## 작동 절차

1. 사전 정의된 메트릭 세트를 쿼리 (기간은 스케줄에 따라 일/주/월).
2. 각 메트릭에 대해 요약 수치와 차트를 `generateQuickChart` 로 생성.
3. 차트 이미지를 S3 에 업로드.
4. Slack 메시지로 요약 + 차트 썸네일을 지정 채널에 post.

## 구성

- 스케줄: `agents.yaml` 에서 cron 식으로 지정
- 채널: `settings/channel-app-mapping.yaml` 에서 agent → channel 매핑
- 리포트 템플릿: `settings/cron-reports/*.yaml` 에 정의

## 실패 처리

쿼리/차트/업로드 중 하나라도 실패하면 에이전트가 실행 상태를 `failed` 로
기록하고 모니터링 알람을 발생시킵니다 (execution-state + monitors).
