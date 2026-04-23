export interface RequestLog {
  id: string;
  timestamp: string;
  agent: string;
  query: string;
  userId: string;
  source: string;
  success: boolean;
  responseText: string | null;
  errorMessage: string | null;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface LogQuery {
  limit?: number;
  offset?: number;
  agent?: string;
  success?: boolean;
  startDate?: string;
  endDate?: string;
}

export interface LogStore {
  insert(entry: RequestLog): void;
  query(opts?: LogQuery): { logs: RequestLog[]; total: number };
}
