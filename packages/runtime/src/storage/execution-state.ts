export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'timeout';

export interface ExecutionState {
  id: string;
  agent: string;
  query: string;
  userId: string;
  source: string;
  status: ExecutionStatus;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
  retryCount: number;
}

export interface ExecutionStateStore {
  start(input: Omit<ExecutionState, 'status' | 'startedAt' | 'completedAt' | 'durationMs' | 'error' | 'retryCount'>): ExecutionState;
  complete(id: string, durationMs: number): void;
  fail(id: string, error: string, durationMs: number): void;
  get(id: string): ExecutionState | null;
}
