import type { Guardrail, GuardrailInput, GuardrailResult } from './types.js';
import { piiFilter, readOnlySql, queryLength, promptInjection, rowLimit } from './built-in.js';

const BUILT_IN_GUARDRAILS: Record<string, Guardrail> = {
  'pii-filter': piiFilter,
  'read-only': readOnlySql,
  'query-length': queryLength,
  'prompt-injection': promptInjection,
  'row-limit': rowLimit,
};

const customGuardrails = new Map<string, Guardrail>();

export function registerGuardrail(guardrail: Guardrail): void {
  customGuardrails.set(guardrail.name, guardrail);
}

export function getGuardrail(name: string): Guardrail | undefined {
  return customGuardrails.get(name) || BUILT_IN_GUARDRAILS[name];
}

export function listGuardrails(): string[] {
  return [...Object.keys(BUILT_IN_GUARDRAILS), ...customGuardrails.keys()];
}

/**
 * Run a chain of guardrails. Fails fast on first failure.
 */
export function runGuardrails(
  guardrailNames: string[],
  input: GuardrailInput,
): { pass: boolean; results: GuardrailResult[] } {
  const results: GuardrailResult[] = [];

  for (const name of guardrailNames) {
    const guardrail = getGuardrail(name);
    if (!guardrail) {
      console.warn(`[Guardrails] Unknown guardrail: ${name}, skipping`);
      continue;
    }

    const result = guardrail.check(input);
    results.push(result);

    if (!result.pass) {
      return { pass: false, results };
    }
  }

  return { pass: true, results };
}
