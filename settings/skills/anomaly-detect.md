---
name: anomaly-detect
description: "시계열 데이터에서 통계적 이상치 탐지"
requiredTools:
  - executeSnowflakeQuery
guardrails:
  - read-only
  - time-range
triggers:
  - 이상치
  - anomaly
  - spike
  - 급증
  - 급감
---

# Anomaly Detection Skill

시계열 데이터에서 통계적 이상치를 찾습니다.

## 작동 절차

1. 대상 메트릭과 기간을 확인합니다. 기간 미지정 시 최근 14일.
2. 이동평균 ± 3σ 또는 IQR 바깥 값을 이상치 후보로 표시.
3. 각 이상치에 대해 전/후 24시간 컨텍스트를 함께 보여줍니다.

## 한계

- 계절성 (주간/월간 패턴) 은 현재 고려하지 않습니다. 향후 STL 분해나
  Prophet 기반 모델로 확장 가능.
- 분 단위 고빈도 데이터는 쿼리 비용이 크므로 1시간 bucket 으로 다운샘플링.
