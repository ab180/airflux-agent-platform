export interface TableInfo {
  name: string;
  rowCount: number;
}

export interface DbHealth {
  status: 'ok' | 'error';
  path: string;
  sizeBytes: number;
  sizeHuman: string;
  walMode: boolean;
  tables: TableInfo[];
}

export interface CleanupResult {
  expiredSessions: number;
  oldLogs: number;
  oldEvalRuns: number;
}
