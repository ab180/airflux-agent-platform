export interface GuardrailResult {
  pass: boolean;
  reason?: string;
  guardrail: string;
}

export interface Guardrail {
  name: string;
  description: string;
  check(input: GuardrailInput): GuardrailResult;
}

export interface GuardrailInput {
  text: string;
  type: 'input' | 'output' | 'sql';
  agentName?: string;
  metadata?: Record<string, unknown>;
}
