/**
 * FeedbackStore — user thumbs-up/down on agent responses plus optional
 * comment, joined with the original request log for display.
 *
 * Runtime owns the types. SQLite impl lives in
 * packages/server/src/store/feedback-store.ts; future Postgres adapter
 * satisfies the same interface.
 */

export type FeedbackRating = 'positive' | 'negative';

export interface Feedback {
  id: string;
  traceId: string;
  rating: FeedbackRating;
  comment: string | null;
  userId: string;
  agent: string;
  timestamp: string;
}

export interface FeedbackDetail extends Feedback {
  query: string | null;
  responseText: string | null;
  durationMs: number | null;
}

export interface FeedbackStore {
  insert(feedback: Feedback): void;
  getDetail(traceId: string): FeedbackDetail | null;
}
