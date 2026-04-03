/**
 * Markdown → Slack mrkdwn Converter
 *
 * Montgomery github/release.ts의 convertMarkdownToSlack에서 직접 추출.
 * LLM 응답(Markdown)을 Slack Block Kit에서 표시 가능한 mrkdwn으로 변환.
 */

/**
 * Convert Markdown to Slack mrkdwn format
 */
export function markdownToSlack(text: string): string {
  let converted = text;

  // Headings (###, ##, #) → bold
  converted = converted.replace(/^###\s+(.+)$/gm, '*$1*');
  converted = converted.replace(/^##\s+(.+)$/gm, '*$1*');
  converted = converted.replace(/^#\s+(.+)$/gm, '*$1*');

  // Markdown links [text](url) → Slack links <url|text>
  converted = converted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>');

  // Bold **text** → *text*
  converted = converted.replace(/\*\*(.+?)\*\*/g, '*$1*');

  // Italic _text_ (단독) — Slack에서 동일하므로 변환 불필요

  // Code blocks ```lang\n...\n``` → 그대로 유지 (Slack 지원)

  // Inline code `text` → 그대로 유지

  // Bullet points - item → • item
  converted = converted.replace(/^-\s+/gm, '• ');

  // Numbered lists 1. item → 그대로 유지 (Slack에서 가독성 충분)

  // Horizontal rules --- → 빈 줄 (Slack에서 divider block 사용 권장)
  converted = converted.replace(/^---+$/gm, '');

  // HTML comments <!-- --> 제거 (Montgomery: markdown comments removal)
  converted = converted.replace(/<!--[\s\S]*?-->/g, '');

  // 연속 빈 줄 정리 (3줄 이상 → 2줄)
  converted = converted.replace(/\n{3,}/g, '\n\n');

  return converted.trim();
}

/**
 * Truncate text at a natural boundary (newline)
 * Montgomery: release.ts processedBody() 패턴
 */
export function truncateAtBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  let truncated = text.substring(0, maxLength);
  const lastNewline = truncated.lastIndexOf('\n');
  if (lastNewline > maxLength * 0.5) {
    truncated = truncated.substring(0, lastNewline);
  }
  return truncated + '...';
}

/**
 * Format LLM response for Slack display
 * Combines markdown conversion + truncation + cleanup
 */
export function formatLLMResponseForSlack(response: string, maxLength: number = 3800): string {
  const slackFormatted = markdownToSlack(response);
  return truncateAtBoundary(slackFormatted, maxLength);
}
