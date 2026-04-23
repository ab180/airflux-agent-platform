---
name: chart-generation
description: "데이터를 차트/시각화로 변환"
requiredTools:
  - generateQuickChart
  - uploadToS3
guardrails:
  - cost-estimation
triggers:
  - 차트
  - 그래프
  - 시각화
  - visualize
---

# Chart Generation Skill

쿼리 결과 또는 이미 가공된 데이터를 차트 이미지로 변환합니다.

## 작동 절차

1. 데이터 shape 에 따라 적절한 차트 유형을 선택합니다
   (시계열 → line, 범주 비교 → bar, 비율 → pie 등).
2. `generateQuickChart` 로 차트 config를 생성합니다 (QuickChart.io 사용).
3. 생성된 이미지를 `uploadToS3` 로 업로드하고 presigned URL을 반환합니다.

## 비용

이미지 호스팅은 S3 비용만 발생하지만 `cost-estimation` guardrail 이
대량 요청 (하루 100개 초과 등) 에 경고합니다.
