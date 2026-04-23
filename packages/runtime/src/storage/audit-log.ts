/**
 * AuditLogStore — append-only record of security-relevant events.
 *
 * Distinct from request/execution logs: audit captures who did what (admin
 * auth, token create/delete, prompt changes, config changes) for compliance
 * and incident response. The body of user queries is NOT kept here.
 *
 * Runtime owns the interface + types. Concrete adapters (SQLite, Postgres)
 * live in their own modules — see packages/server/src/store/audit-log.ts
 * for the SQLite adapter used by the local/dev stack today.
 */

export type AuditOutcome = 'success' | 'failure';

export interface AuditEvent {
  userId: string;
  action: string;
  resource?: string;
  outcome: AuditOutcome;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditRow extends AuditEvent {
  id: string;
  timestamp: string;
}

export interface QueryAuditOpts {
  limit?: number;
  offset?: number;
  userId?: string;
  action?: string;
  outcome?: AuditOutcome;
  startDate?: string;
  endDate?: string;
}

export interface AuditLogStore {
  log(event: AuditEvent): void;
  query(opts?: QueryAuditOpts): { events: AuditRow[]; total: number };
}
