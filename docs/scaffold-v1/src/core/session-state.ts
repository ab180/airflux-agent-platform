/**
 * Session State Management — Montgomery src/utils/thread-state.ts에서 영감
 *
 * Montgomery 패턴: Dual-Layer Persistence
 * 1. In-memory Map: Lambda warm start에서 빠른 조회
 * 2. 외부 저장소 폴백: cold start에서 상태 복원
 *
 * Airflux 확장:
 * - 분석 세션 상태 추적 (질문 히스토리, 사용 메트릭)
 * - 자동 만료 (30분 비활성)
 * - Montgomery: warningShownThreads → 중복 방지
 */

const MAX_AGE_MS = 30 * 60 * 1000; // 30분

export interface SessionData {
  userId: string;
  channelId: string;
  threadTs: string;
  questions: string[];      // 이 세션에서 질문한 내용
  lastSQL?: string;         // 마지막 실행 SQL
  lastMetrics?: string[];   // 마지막 사용 메트릭
  createdAt: number;
  lastActiveAt: number;
}

// In-memory 캐시 (Layer 1 — Montgomery 패턴)
const sessions = new Map<string, SessionData>();

// 중복 경고 방지 (Montgomery: warningShownThreads)
const warningsShown = new Set<string>();

/**
 * 세션 조회 (생성 없이)
 */
export function getSession(threadTs: string): SessionData | undefined {
  const session = sessions.get(threadTs);
  if (session && Date.now() - session.lastActiveAt > MAX_AGE_MS) {
    sessions.delete(threadTs); // 만료
    return undefined;
  }
  return session;
}

/**
 * 세션 조회 또는 생성
 */
export function getOrCreateSession(
  threadTs: string,
  userId: string,
  channelId: string
): SessionData {
  let session = getSession(threadTs);
  if (!session) {
    session = {
      userId, channelId, threadTs,
      questions: [],
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };
    sessions.set(threadTs, session);
  }
  session.lastActiveAt = Date.now();
  cleanupOldSessions();
  return session;
}

/**
 * 세션에 질문 추가
 */
export function addQuestionToSession(threadTs: string, question: string, sql?: string, metrics?: string[]): void {
  const session = sessions.get(threadTs);
  if (session) {
    session.questions.push(question);
    if (sql) session.lastSQL = sql;
    if (metrics) session.lastMetrics = metrics;
    session.lastActiveAt = Date.now();
  }
}

/**
 * 경고 중복 표시 방지 (Montgomery: shouldShowWarning)
 */
export function shouldShowWarning(key: string): boolean {
  if (warningsShown.has(key)) return false;
  warningsShown.add(key);
  return true;
}

/**
 * 오래된 세션 정리 (Montgomery: cleanupOldEntries)
 */
function cleanupOldSessions(): void {
  const now = Date.now();
  for (const [key, session] of sessions) {
    if (now - session.lastActiveAt > MAX_AGE_MS) {
      sessions.delete(key);
    }
  }
  // warningsShown도 1000개 초과 시 정리
  if (warningsShown.size > 1000) {
    warningsShown.clear();
  }
}

/**
 * 세션 통계 (디버그/모니터링용)
 */
export function getSessionStats(): { activeSessions: number; totalQuestions: number } {
  cleanupOldSessions();
  let totalQuestions = 0;
  for (const session of sessions.values()) {
    totalQuestions += session.questions.length;
  }
  return { activeSessions: sessions.size, totalQuestions };
}
