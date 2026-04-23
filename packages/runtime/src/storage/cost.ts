export interface CostEntry {
  agent: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  timestamp: string;
  userId: string;
}

export interface CostStore {
  record(entry: CostEntry): Promise<void> | void;
}
