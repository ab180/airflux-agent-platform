/** Max allowed length for user-provided strings to prevent abuse. */
const MAX_QUERY_LENGTH = 2000;
const MAX_FIELD_LENGTH = 200;
const AGENT_NAME_PATTERN = /^[a-z][a-z0-9-]{0,49}$/;

export interface ValidatedQueryBody {
  query: string;
  agent?: string;
  userId: string;
  sessionId?: string;
  metadata: Record<string, unknown>;
}

export type ValidationResult =
  | { ok: true; data: ValidatedQueryBody }
  | { ok: false; error: string };

export function validateQueryBody(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object' };
  }

  const b = body as Record<string, unknown>;

  // query: required, string, max length
  if (typeof b.query !== 'string' || b.query.trim().length === 0) {
    return { ok: false, error: 'query is required and must be a non-empty string' };
  }
  if (b.query.length > MAX_QUERY_LENGTH) {
    return { ok: false, error: `query must be at most ${MAX_QUERY_LENGTH} characters` };
  }

  // agent: optional, must match safe pattern
  if (b.agent !== undefined) {
    if (typeof b.agent !== 'string' || !AGENT_NAME_PATTERN.test(b.agent)) {
      return { ok: false, error: 'agent must be a lowercase alphanumeric name with dashes' };
    }
  }

  // userId: optional string, max length
  let userId = 'anonymous';
  if (b.userId !== undefined) {
    if (typeof b.userId !== 'string') {
      return { ok: false, error: 'userId must be a string' };
    }
    if (b.userId.length > MAX_FIELD_LENGTH) {
      return { ok: false, error: `userId must be at most ${MAX_FIELD_LENGTH} characters` };
    }
    userId = b.userId;
  }

  // sessionId: optional string
  if (b.sessionId !== undefined && typeof b.sessionId !== 'string') {
    return { ok: false, error: 'sessionId must be a string' };
  }

  // metadata: optional object, limit depth
  let metadata: Record<string, unknown> = {};
  if (b.metadata !== undefined) {
    if (typeof b.metadata !== 'object' || b.metadata === null || Array.isArray(b.metadata)) {
      return { ok: false, error: 'metadata must be a plain object' };
    }
    // Limit metadata size by stringifying and checking
    const metaStr = JSON.stringify(b.metadata);
    if (metaStr.length > 5000) {
      return { ok: false, error: 'metadata too large (max 5KB)' };
    }
    metadata = b.metadata as Record<string, unknown>;
  }

  return {
    ok: true,
    data: {
      query: b.query.trim(),
      agent: b.agent as string | undefined,
      userId,
      sessionId: b.sessionId as string | undefined,
      metadata,
    },
  };
}
