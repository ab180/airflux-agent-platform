# Image Generation

> 차트, 다이어그램, 시각화 자동 생성

## 3가지 경로

| 경로 | 도구 | 적합한 경우 | 속도 |
|------|------|-----------|------|
| QuickChart URL | QuickChart.io API | 표준 차트 (bar, line, pie) | ~100ms |
| Gemini Image | Gemini 3.1 Flash Image Preview | 커스텀 시각화, 인포그래픽 | ~3s |
| Mermaid | Mermaid.js 문법 | 플로우차트, 시퀀스 다이어그램 | ~50ms |

## 경로 1: QuickChart (빠른 표준 차트)

```typescript
function generateQuickChart(config: {
  type: 'bar' | 'line' | 'pie' | 'doughnut' | 'radar';
  labels: string[];
  datasets: { label: string; data: number[] }[];
  title?: string;
}): string {
  const chartConfig = {
    type: config.type,
    data: { labels: config.labels, datasets: config.datasets },
    options: {
      title: { display: !!config.title, text: config.title },
      plugins: { datalabels: { display: true } },
    },
  };
  return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=600&h=400`;
}
```

Slack에서는 이미지 URL을 직접 unfurl. API 응답에서는 URL 반환.

## 경로 2: Gemini Multimodal Image

복잡한 시각화나 인포그래픽이 필요할 때:

```typescript
async function generateGeminiImage(prompt: string, data: any): Promise<string> {
  const result = await generateText({
    model: 'google/gemini-3.1-flash-image-preview',
    prompt: `
      다음 데이터를 시각적으로 표현하는 차트 이미지를 생성하세요.
      깔끔하고 전문적인 스타일, 한국어 레이블.

      데이터: ${JSON.stringify(data)}
      요청: ${prompt}
    `,
  });

  if (result.files?.[0]) {
    const imageBuffer = result.files[0].data;
    const key = `charts/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.png`;
    const url = await uploadToS3AndGetPresignedUrl(imageBuffer, key);
    return url;
  }
  throw new AirfluxError('LLM-API-001', { reason: 'No image generated' });
}
```

## 경로 3: Mermaid 다이어그램

시스템 구조, 흐름도, 시퀀스 다이어그램:

```typescript
function generateMermaid(type: string, description: string): string {
  // LLM이 Mermaid 문법을 생성
  // Slack: 코드 블록으로 표시 (렌더링은 클라이언트)
  // API: mermaid 문자열 + 렌더링된 SVG URL 모두 반환
  return mermaidSyntax;
}
```

## 차트 → 엔드포인트별 전달

| 엔드포인트 | 전달 방식 |
|-----------|----------|
| Slack | 이미지 URL을 Block Kit image block으로 |
| REST API | `{ chartUrl, mermaid, rawData }` JSON |
| Cron Report | S3 HTML 리포트에 인라인 이미지 |
| Webhook | callback URL로 이미지 URL POST |
