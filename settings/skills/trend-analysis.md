---
name: trend-analysis
description: "지표 추이 분석 및 비교"
requiredTools:
  - executeSnowflakeQuery
  - generateQuickChart
guardrails:
  - read-only
triggers:
  - 추이
  - 트렌드
  - trend
  - 비교
  - 전주
  - 전월
---

# Trend Analysis Skill

특정 메트릭의 시간축 추이를 분석하고 기간별 비교를 수행합니다.

## 작동 절차

1. 메트릭과 비교 기간을 결정 (WoW, MoM, YoY 가 기본).
2. 쿼리로 시계열 데이터를 가져와 성장률을 계산합니다.
3. `generateQuickChart` 로 라인 차트 렌더. 비교 기간은 점선으로.
4. 해석 문구 (성장/하락 주요 시점) 을 자연어로 덧붙입니다.

## 출력 포맷

- 숫자 요약: 현재 값, 변동률, 트렌드 방향 화살표
- 차트 이미지 URL
- 해석 1-2문장
