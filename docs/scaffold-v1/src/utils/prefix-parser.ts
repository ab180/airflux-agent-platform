/**
 * Prefix Parser — Montgomery parseThinkPrefix/parseAgentPrefix 패턴 통합
 *
 * Montgomery 접두사: think:, DEV:, D:
 * Airflux 접두사: debug:, explain:, sql:
 */

export interface ParsedInput {
  debug: boolean;
  explain: boolean;
  rawSQL: boolean;
  cleanText: string;
}

export function parseUserInput(text: string): ParsedInput {
  let remaining = text.trim();

  // 봇 멘션 제거
  remaining = remaining.replace(/<@[A-Z0-9]+>/g, '').trim();

  // 접두사 감지 (대소문자 무시)
  const debug = /^debug[:\s]\s*/i.test(remaining);
  const explain = /^explain[:\s]\s*/i.test(remaining);
  const rawSQL = /^sql[:\s]\s*/i.test(remaining);

  // 접두사 제거
  if (debug) remaining = remaining.replace(/^debug[:\s]\s*/i, '');
  if (explain) remaining = remaining.replace(/^explain[:\s]\s*/i, '');
  if (rawSQL) remaining = remaining.replace(/^sql[:\s]\s*/i, '');

  return { debug, explain, rawSQL, cleanText: remaining.trim() };
}
