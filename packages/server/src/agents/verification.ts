/**
 * Post-execution verification gate (GSD-2 verification pattern).
 * Runs configured commands after agent execution to validate output quality.
 * On failure, can inject errors back into the agent for auto-fix retry.
 */

import { execSync } from 'child_process';
import { logger } from '../lib/logger.js';

export interface VerificationResult {
  passed: boolean;
  command: string;
  output: string;
  durationMs: number;
}

export interface VerificationGateResult {
  allPassed: boolean;
  results: VerificationResult[];
  totalDurationMs: number;
}

/**
 * Run a list of verification commands and return results.
 * Each command runs with a 30s timeout.
 */
export function runVerificationGate(commands: string[]): VerificationGateResult {
  if (!commands || commands.length === 0) {
    return { allPassed: true, results: [], totalDurationMs: 0 };
  }

  const results: VerificationResult[] = [];
  const gateStart = performance.now();

  for (const cmd of commands) {
    const start = performance.now();
    try {
      const output = execSync(cmd, {
        timeout: 30_000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      results.push({
        passed: true,
        command: cmd,
        output: output.slice(0, 2000),
        durationMs: Math.round(performance.now() - start),
      });
    } catch (e) {
      const err = e as { stderr?: string; stdout?: string; message?: string };
      const output = (err.stderr || err.stdout || err.message || 'Unknown error').slice(0, 2000);
      results.push({
        passed: false,
        command: cmd,
        output,
        durationMs: Math.round(performance.now() - start),
      });
      logger.warn('Verification command failed', { command: cmd, output: output.slice(0, 200) });
    }
  }

  return {
    allPassed: results.every(r => r.passed),
    results,
    totalDurationMs: Math.round(performance.now() - gateStart),
  };
}

/**
 * Build a feedback prompt from verification failures for agent self-correction.
 */
export function buildVerificationFeedback(results: VerificationResult[]): string {
  const failures = results.filter(r => !r.passed);
  if (failures.length === 0) return '';

  return failures
    .map(f => `검증 실패 [${f.command}]:\n${f.output}`)
    .join('\n\n');
}
