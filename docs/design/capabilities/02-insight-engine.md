# Insight Engine

> 데이터 기반 자동 인사이트 생성, 이상 탐지, 추이 분석

## 기능

### 1. 이상 탐지 (Anomaly Detection)
시계열 데이터에서 통계적 이상치를 자동 감지.

```
데이터 조회 (SQL Agent 위임)
  ↓
Z-score 계산 (|z| > 2 = 이상)
  ↓
IQR 검증 (Q1 - 1.5*IQR ~ Q3 + 1.5*IQR)
  ↓
이상치 목록 + 설명 생성 (LLM)
```

```typescript
function detectAnomalies(
  data: { date: string; value: number }[],
  sensitivity: 'low' | 'medium' | 'high'
): AnomalyResult[] {
  const values = data.map(d => d.value);
  const mean = avg(values);
  const std = stddev(values);
  const threshold = { low: 3, medium: 2, high: 1.5 }[sensitivity];

  return data
    .filter(d => Math.abs((d.value - mean) / std) > threshold)
    .map(d => ({
      date: d.date,
      value: d.value,
      zscore: (d.value - mean) / std,
      direction: d.value > mean ? 'spike' : 'drop',
    }));
}
```

### 2. 추이 분석 (Trend Analysis)
기간 대비 변화율, 패턴 감지.

- 주간 대비 (WoW), 월간 대비 (MoM)
- 이동 평균선 기반 추세 판단
- 변곡점 감지 (기울기 부호 변경)

### 3. 자동 비교 분석
- 앱 간 비교: "이 앱은 동종 앱 대비 이벤트 수가 30% 적습니다"
- 기간 간 비교: "지난 주 대비 purchase 이벤트가 45% 감소했습니다"

### 4. Cron 기반 자동 리포트

```yaml
# settings/cron-reports.yaml
daily_anomaly:
  schedule: "0 9 * * *"       # 매일 오전 9시
  query: "지난 24시간 주요 이벤트 이상치 분석"
  agents: [sql, insight]
  channels:
    - type: slack
      channel: "#airflux-alerts"
    - type: s3
      path: "reports/daily/"

weekly_summary:
  schedule: "0 10 * * 1"      # 매주 월요일 오전 10시
  query: "지난 주 주요 지표 요약 및 전주 대비 변화"
  agents: [sql, insight, image]
  channels:
    - type: slack
      channel: "#airflux-weekly"
```

## 출력 예시

```
📊 일일 이상치 리포트 (2026-04-02)

🔴 이상 감지 2건:
  1. app_id=456 (MyApp) — purchase 이벤트 78% 급감
     - 어제: 1,234건 → 오늘: 267건
     - Z-score: -3.2 (심각)
     - 가능 원인: SDK 업데이트 후 이벤트 누락 가능성

  2. app_id=789 (TestApp) — 전체 이벤트 320% 급증
     - 어제: 5,000건 → 오늘: 21,000건
     - Z-score: +4.1 (심각)
     - 가능 원인: 테스트 트래픽 또는 봇 활동

✅ 정상: 나머지 142개 앱 정상 범위

📈 [차트 이미지 첨부]
```
