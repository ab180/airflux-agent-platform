/**
 * Eval runner — shared by admin route and platform cron.
 *
 * Runs the golden dataset through the router + agent, applies pass checks
 * (expectedAgent / expectedContains), and optionally escalates rubric-only
 * cases to LLM-as-judge. Persists the run via eval-store.
 */

import { AgentRegistry, HttpResponseChannel } from '@airflux/core';
import {
  getGoldenDataset,
  saveEvalRun,
  seedDefaultTestCases,
  type EvalResult,
  type EvalRun,
} from '../store/eval-store.js';
import { judgeWithLLM } from './judge.js';
import { createModelAsync, isLLMAvailable } from '../llm/model-factory.js';
import { generateText } from 'ai';

export interface RunEvalOptions {
  useJudge?: boolean;
}

export async function runEval(opts: RunEvalOptions = {}): Promise<EvalRun> {
  seedDefaultTestCases();
  const dataset = getGoldenDataset();
  if (dataset.length === 0) {
    throw new Error('No test cases in golden dataset');
  }

  const useJudge = !!opts.useJudge && isLLMAvailable();
  const results: EvalResult[] = [];

  // Import lazily to avoid top-level side effects / circular imports.
  const { getRouter } = await import('../bootstrap.js');

  for (const tc of dataset) {
    const startTime = performance.now();
    try {
      const routed = await getRouter().route(tc.question);
      const agent = AgentRegistry.getOptional(routed.agent);
      const agentName = routed.agent;
      let response = '';

      if (agent && agent.isEnabled()) {
        const channel = new HttpResponseChannel();
        const result = await AgentRegistry.execute(agentName, {
          question: tc.question,
          userId: 'eval-system',
          sessionId: `eval-${Date.now()}`,
          source: 'api' as const,
          responseChannel: channel,
          metadata: {},
        });
        response = result.text || result.error || '';
      }

      const durationMs = Math.round(performance.now() - startTime);

      let passed = true;
      let reason = 'OK';

      if (tc.expectedAgent && tc.expectedAgent !== agentName) {
        passed = false;
        reason = `Expected agent ${tc.expectedAgent}, got ${agentName}`;
      } else if (
        tc.expectedContains &&
        !response.toLowerCase().includes(tc.expectedContains.toLowerCase())
      ) {
        passed = false;
        reason = `Response missing expected text: "${tc.expectedContains}"`;
      } else if (useJudge && tc.rubric && !tc.expectedAgent && !tc.expectedContains) {
        const judged = await judgeWithLLM(
          { question: tc.question, rubric: tc.rubric, actual: response },
          async (prompt) => {
            const model = await createModelAsync('fast');
            const out = await generateText({ model, prompt });
            return out.text;
          },
        );
        if (judged.score < 7) {
          passed = false;
        }
        reason = `Judge score ${judged.score}/10 — ${judged.rationale}`;
      }

      results.push({
        caseId: tc.id,
        question: tc.question,
        expectedAgent: tc.expectedAgent,
        actualAgent: agentName,
        expectedContains: tc.expectedContains,
        actualResponse: response.slice(0, 300),
        passed,
        reason,
        durationMs,
      });
    } catch (e) {
      results.push({
        caseId: tc.id,
        question: tc.question,
        actualAgent: 'error',
        actualResponse: '',
        passed: false,
        reason: `Error: ${e instanceof Error ? e.message : 'unknown'}`,
        durationMs: Math.round(performance.now() - startTime),
      });
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const score = results.length > 0 ? Number(((passed / results.length) * 100).toFixed(1)) : 0;

  return saveEvalRun({
    timestamp: new Date().toISOString(),
    totalCases: results.length,
    passed,
    failed,
    score,
    results,
  });
}
