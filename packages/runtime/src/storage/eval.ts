export type EvalDifficulty = 'easy' | 'medium' | 'hard';

export interface GoldenTestCase {
  id: number;
  agent: string;
  category: string;
  difficulty: EvalDifficulty;
  question: string;
  expectedAgent?: string;
  expectedContains?: string;
  rubric?: string;
  enabled: boolean;
}

export interface EvalResult {
  caseId: number;
  question: string;
  expectedAgent?: string;
  actualAgent: string;
  expectedContains?: string;
  actualResponse: string;
  passed: boolean;
  reason: string;
  durationMs: number;
}

export interface EvalRun {
  id: number;
  timestamp: string;
  totalCases: number;
  passed: number;
  failed: number;
  score: number;
  results: EvalResult[];
}

export interface EvalStore {
  listGoldenCases(agent?: string): GoldenTestCase[];
  recordRun(run: Omit<EvalRun, 'id'>): EvalRun;
  listRuns(limit?: number): EvalRun[];
}
