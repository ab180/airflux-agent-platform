/**
 * Self-correction loop for guardrail failures.
 * Instead of immediately blocking, feeds guardrail feedback back to the agent
 * for automatic retry. Inspired by Aider's lint loop and SWE-agent's lint gate.
 *
 * Pattern: Agent output → Guardrail check → If fail → Feed error as context → Agent retries
 */

import { runGuardrails } from './runner.js';
import type { GuardrailInput, GuardrailResult } from './types.js';

export interface CorrectionAttempt {
  attempt: number;
  input: string;
  guardrailResults: GuardrailResult[];
  corrected: boolean;
}

export interface CorrectionResult {
  finalPass: boolean;
  finalInput: string;
  attempts: CorrectionAttempt[];
  totalAttempts: number;
  correctedOn?: number; // which attempt succeeded (1-indexed)
}

/**
 * Run guardrails with self-correction.
 * If the first check fails, generates a correction prompt for the agent.
 *
 * @param guardrailNames - guardrails to run
 * @param input - the input to check
 * @param correctionFn - async function that takes feedback and returns corrected input
 * @param maxRetries - max correction attempts (default 2)
 */
export async function runWithSelfCorrection(
  guardrailNames: string[],
  input: GuardrailInput,
  correctionFn: (feedback: string, previousInput: string) => Promise<string>,
  maxRetries: number = 2,
): Promise<CorrectionResult> {
  const attempts: CorrectionAttempt[] = [];
  let currentInput = input.text;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const check = runGuardrails(guardrailNames, { ...input, text: currentInput });

    attempts.push({
      attempt,
      input: currentInput,
      guardrailResults: check.results,
      corrected: check.pass,
    });

    if (check.pass) {
      return {
        finalPass: true,
        finalInput: currentInput,
        attempts,
        totalAttempts: attempt,
        correctedOn: attempt > 1 ? attempt : undefined,
      };
    }

    // Last attempt failed — no more retries
    if (attempt > maxRetries) break;

    // Build correction feedback
    const failedResults = check.results.filter(r => !r.pass);
    const feedback = failedResults
      .map(r => `[${r.guardrail}] ${r.reason}`)
      .join('; ');

    // Ask the correction function to fix the input
    try {
      currentInput = await correctionFn(feedback, currentInput);
    } catch {
      break; // correction function failed, stop retrying
    }
  }

  return {
    finalPass: false,
    finalInput: currentInput,
    attempts,
    totalAttempts: attempts.length,
  };
}

/**
 * Generate a correction prompt for SQL guardrail failures.
 * Returns a human-readable instruction for the agent.
 */
export function buildSqlCorrectionPrompt(feedback: string, sql: string): string {
  return `이전 SQL이 guardrail 검사에 실패했습니다:
실패 사유: ${feedback}

원래 SQL:
${sql}

위 사유를 해결한 수정된 SQL만 반환하세요.`;
}
