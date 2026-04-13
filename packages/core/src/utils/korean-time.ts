/**
 * Korean time expression normalizer.
 * Converts Korean date/time expressions to ISO date ranges.
 *
 * Supported expressions:
 * - 오늘, 어제, 그저께, 내일
 * - 이번 주, 지난주, 지난 주
 * - 이번 달, 지난달, 지난 달
 * - 올해, 작년
 * - 최근 N일, 최근 N주, 최근 N개월
 * - N일 전, N주 전, N개월 전
 */

export interface DateRange {
  start: string; // ISO date YYYY-MM-DD
  end: string;   // ISO date YYYY-MM-DD
  label: string; // Human-readable description
}

export function normalizeKoreanTime(
  expression: string,
  now: Date = new Date(),
): DateRange | null {
  const text = expression.trim();

  // Helper: format date as YYYY-MM-DD (local timezone, not UTC)
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // 오늘
  if (/오늘/.test(text)) {
    return { start: fmt(today), end: fmt(today), label: '오늘' };
  }

  // 어제
  if (/어제/.test(text)) {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return { start: fmt(d), end: fmt(d), label: '어제' };
  }

  // 그저께
  if (/그저께|그제/.test(text)) {
    const d = new Date(today);
    d.setDate(d.getDate() - 2);
    return { start: fmt(d), end: fmt(d), label: '그저께' };
  }

  // 내일
  if (/내일/.test(text)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return { start: fmt(d), end: fmt(d), label: '내일' };
  }

  // 최근 N일
  const recentDays = text.match(/최근\s*(\d+)\s*일/);
  if (recentDays) {
    const n = parseInt(recentDays[1], 10);
    const start = new Date(today);
    start.setDate(start.getDate() - n);
    return { start: fmt(start), end: fmt(today), label: `최근 ${n}일` };
  }

  // 최근 N주
  const recentWeeks = text.match(/최근\s*(\d+)\s*주/);
  if (recentWeeks) {
    const n = parseInt(recentWeeks[1], 10);
    const start = new Date(today);
    start.setDate(start.getDate() - n * 7);
    return { start: fmt(start), end: fmt(today), label: `최근 ${n}주` };
  }

  // 최근 N개월
  const recentMonths = text.match(/최근\s*(\d+)\s*개월/);
  if (recentMonths) {
    const n = parseInt(recentMonths[1], 10);
    const start = new Date(today);
    start.setMonth(start.getMonth() - n);
    return { start: fmt(start), end: fmt(today), label: `최근 ${n}개월` };
  }

  // N일 전
  const daysAgo = text.match(/(\d+)\s*일\s*전/);
  if (daysAgo) {
    const n = parseInt(daysAgo[1], 10);
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return { start: fmt(d), end: fmt(d), label: `${n}일 전` };
  }

  // N주 전
  const weeksAgo = text.match(/(\d+)\s*주\s*전/);
  if (weeksAgo) {
    const n = parseInt(weeksAgo[1], 10);
    const start = new Date(today);
    start.setDate(start.getDate() - n * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start: fmt(start), end: fmt(end), label: `${n}주 전` };
  }

  // 이번 주
  if (/이번\s*주/.test(text)) {
    const dayOfWeek = today.getDay(); // 0=Sun
    const monday = new Date(today);
    monday.setDate(monday.getDate() - ((dayOfWeek + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    return { start: fmt(monday), end: fmt(sunday), label: '이번 주' };
  }

  // 지난주 / 지난 주
  if (/지난\s*주/.test(text)) {
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(monday.getDate() - ((dayOfWeek + 6) % 7) - 7);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    return { start: fmt(monday), end: fmt(sunday), label: '지난주' };
  }

  // 이번 달
  if (/이번\s*달/.test(text)) {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { start: fmt(start), end: fmt(end), label: '이번 달' };
  }

  // 지난달 / 지난 달
  if (/지난\s*달/.test(text)) {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    return { start: fmt(start), end: fmt(end), label: '지난달' };
  }

  // 올해
  if (/올해/.test(text)) {
    const start = new Date(today.getFullYear(), 0, 1);
    return { start: fmt(start), end: fmt(today), label: '올해' };
  }

  // 작년
  if (/작년/.test(text)) {
    const start = new Date(today.getFullYear() - 1, 0, 1);
    const end = new Date(today.getFullYear() - 1, 11, 31);
    return { start: fmt(start), end: fmt(end), label: '작년' };
  }

  return null;
}

/**
 * Extract and normalize all Korean time expressions from a query.
 */
export function extractTimeExpressions(query: string, now?: Date): DateRange[] {
  const expressions = [
    '오늘', '어제', '그저께', '내일',
    '이번 주', '지난주', '지난 주',
    '이번 달', '지난달', '지난 달',
    '올해', '작년',
  ];

  const results: DateRange[] = [];

  for (const expr of expressions) {
    if (query.includes(expr)) {
      const range = normalizeKoreanTime(expr, now);
      if (range) results.push(range);
    }
  }

  // Dynamic patterns
  const dynamicPatterns = [
    /최근\s*\d+\s*일/, /최근\s*\d+\s*주/, /최근\s*\d+\s*개월/,
    /\d+\s*일\s*전/, /\d+\s*주\s*전/,
  ];

  for (const pattern of dynamicPatterns) {
    const match = query.match(pattern);
    if (match) {
      const range = normalizeKoreanTime(match[0], now);
      if (range) results.push(range);
    }
  }

  return results;
}
