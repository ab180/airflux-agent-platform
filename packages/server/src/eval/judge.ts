/**
 * LLM-as-judge for evaluation runs.
 *
 * For test cases that include a `rubric` (qualitative criterion), we cannot
 * rely on exact-match checks. We ask an LLM to score the answer 0-10 given
 * the rubric and the actual response. The parser is pure and testable;
 * the `judgeWithLLM` helper wraps it with a caller-supplied LLM function
 * so tests can mock the LLM without touching network.
 */

export interface JudgeInput {
  question: string;
  rubric: string;
  actual: string;
}

export interface JudgeOutput {
  score: number;     // 0-10
  rationale: string;
}

export type LLMCaller = (prompt: string) => Promise<string>;

export function parseJudgeResponse(raw: string): JudgeOutput {
  const scoreMatch = raw.match(/score:\s*(-?\d+)/i);
  const rationaleMatch = raw.match(/rationale:\s*([\s\S]*)/i);
  if (!scoreMatch) return { score: 0, rationale: 'unparseable judge response' };
  const parsed = parseInt(scoreMatch[1], 10);
  const score = Math.max(0, Math.min(10, parsed));
  const rationale = rationaleMatch?.[1]?.trim() ?? '';
  return { score, rationale };
}

export async function judgeWithLLM(input: JudgeInput, llm: LLMCaller): Promise<JudgeOutput> {
  const prompt = buildJudgePrompt(input);
  try {
    const raw = await llm(prompt);
    return parseJudgeResponse(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { score: 0, rationale: `judge call failed: ${msg}` };
  }
}

function buildJudgePrompt(i: JudgeInput): string {
  return `You are an evaluator. Score the answer from 0 to 10 against the rubric.

Question: ${i.question}

Rubric: ${i.rubric}

Actual answer:
---
${i.actual}
---

Respond in exactly this format (no preamble):
SCORE: <integer 0-10>
RATIONALE: <one or two sentences explaining the score>
`;
}
