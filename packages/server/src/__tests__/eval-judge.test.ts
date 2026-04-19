import { describe, expect, it, vi } from 'vitest';
import { parseJudgeResponse, judgeWithLLM } from '../eval/judge.js';

describe('parseJudgeResponse', () => {
  it('extracts score and rationale from well-formed response', () => {
    const resp = 'SCORE: 8\nRATIONALE: answer covered all expected keywords';
    const out = parseJudgeResponse(resp);
    expect(out.score).toBe(8);
    expect(out.rationale).toContain('covered all');
  });

  it('clamps score to 0-10', () => {
    expect(parseJudgeResponse('SCORE: 15\nRATIONALE: x').score).toBe(10);
    expect(parseJudgeResponse('SCORE: -3\nRATIONALE: x').score).toBe(0);
  });

  it('returns 0 + default rationale on malformed response', () => {
    const out = parseJudgeResponse('whatever');
    expect(out.score).toBe(0);
    expect(out.rationale).toContain('unparseable');
  });

  it('is case-insensitive on SCORE/RATIONALE labels', () => {
    const out = parseJudgeResponse('score: 7\nrationale: partial match');
    expect(out.score).toBe(7);
    expect(out.rationale).toContain('partial match');
  });
});

describe('judgeWithLLM', () => {
  it('calls llm with rubric + answer and returns parsed score', async () => {
    const llm = vi.fn().mockResolvedValue('SCORE: 7\nRATIONALE: ok');
    const out = await judgeWithLLM(
      {
        question: 'DAU 알려줘',
        rubric: 'Agent should return a metric summary',
        actual: 'DAU는 1234입니다',
      },
      llm,
    );
    expect(llm).toHaveBeenCalledOnce();
    const prompt = llm.mock.calls[0][0] as string;
    expect(prompt).toContain('DAU 알려줘');
    expect(prompt).toContain('DAU는 1234입니다');
    expect(prompt).toContain('Agent should return a metric summary');
    expect(out.score).toBe(7);
    expect(out.rationale).toBe('ok');
  });

  it('returns score 0 + rationale when llm throws', async () => {
    const llm = vi.fn().mockRejectedValue(new Error('rate limit'));
    const out = await judgeWithLLM(
      { question: 'q', rubric: 'r', actual: 'a' },
      llm,
    );
    expect(out.score).toBe(0);
    expect(out.rationale).toContain('rate limit');
  });
});
