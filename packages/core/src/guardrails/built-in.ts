import type { Guardrail, GuardrailInput, GuardrailResult } from './types.js';

/**
 * PII filter: blocks common PII patterns (Korean resident IDs, phone numbers, emails, credit cards)
 */
export const piiFilter: Guardrail = {
  name: 'pii-filter',
  description: 'Blocks requests or responses containing personal identifiable information',
  check(input: GuardrailInput): GuardrailResult {
    const patterns = [
      { name: '주민등록번호', regex: /\d{6}-[1-4]\d{6}/ },
      { name: '전화번호', regex: /01[016789]-?\d{3,4}-?\d{4}/ },
      { name: '이메일', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/ },
      { name: '신용카드', regex: /\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/ },
    ];

    for (const { name, regex } of patterns) {
      if (regex.test(input.text)) {
        return { pass: false, reason: `PII detected: ${name}`, guardrail: this.name };
      }
    }
    return { pass: true, guardrail: this.name };
  },
};

/**
 * Read-only SQL check: blocks write operations in SQL queries
 */
export const readOnlySql: Guardrail = {
  name: 'read-only',
  description: 'Ensures SQL queries are read-only (no INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE)',
  check(input: GuardrailInput): GuardrailResult {
    if (input.type !== 'sql') return { pass: true, guardrail: this.name };

    const writePatterns = [
      /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|REPLACE|MERGE)\b/i,
      /\bINTO\b/i,
    ];

    for (const pattern of writePatterns) {
      if (pattern.test(input.text)) {
        return {
          pass: false,
          reason: `Write operation detected in SQL: ${input.text.match(pattern)?.[0]}`,
          guardrail: this.name,
        };
      }
    }
    return { pass: true, guardrail: this.name };
  },
};

/**
 * Query length limit
 */
export const queryLength: Guardrail = {
  name: 'query-length',
  description: 'Limits query length to prevent abuse',
  check(input: GuardrailInput): GuardrailResult {
    const maxLength = (input.metadata?.maxLength as number) || 5000;
    if (input.text.length > maxLength) {
      return {
        pass: false,
        reason: `Query exceeds maximum length of ${maxLength} characters`,
        guardrail: this.name,
      };
    }
    return { pass: true, guardrail: this.name };
  },
};

/**
 * Prompt injection detection: basic heuristic check
 */
export const promptInjection: Guardrail = {
  name: 'prompt-injection',
  description: 'Detects common prompt injection patterns',
  check(input: GuardrailInput): GuardrailResult {
    if (input.type !== 'input') return { pass: true, guardrail: this.name };

    const suspiciousPatterns = [
      // Direct instruction override
      /ignore\s+(all\s+)?previous\s+instructions/i,
      /forget\s+(all\s+)?your\s+instructions/i,
      /disregard\s+(all\s+)?(previous|prior|above)\s/i,
      /override\s+(all\s+)?(previous|system)\s/i,
      // Role hijacking
      /you\s+are\s+now\s+/i,
      /act\s+as\s+(a|an)\s+(different|new|evil|malicious)/i,
      /pretend\s+(to\s+be|you\s+are)\s/i,
      // System prompt extraction
      /\bsystem\s*:\s*/i,
      /reveal\s+(your|the)\s+(system\s+)?prompt/i,
      /show\s+(me\s+)?(your|the)\s+(system\s+)?prompt/i,
      /what\s+(are|is)\s+your\s+(system\s+)?instructions/i,
      // Privilege escalation
      /\b(ADMIN|ROOT)\s*OVERRIDE\b/i,
      /\bsudo\s+/i,
      /```\s*system/i,
      // Delimiter injection
      /\[INST\]/i,
      /<\|im_start\|>/i,
      /\bHuman\s*:\s*/i,
      /\bAssistant\s*:\s*/i,
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(input.text)) {
        return {
          pass: false,
          reason: 'Potential prompt injection detected',
          guardrail: this.name,
        };
      }
    }
    return { pass: true, guardrail: this.name };
  },
};

/**
 * Row limit check for SQL results
 */
export const rowLimit: Guardrail = {
  name: 'row-limit',
  description: 'Ensures SQL queries include a LIMIT clause',
  check(input: GuardrailInput): GuardrailResult {
    if (input.type !== 'sql') return { pass: true, guardrail: this.name };

    if (!/\bLIMIT\b/i.test(input.text)) {
      return {
        pass: false,
        reason: 'SQL query must include a LIMIT clause',
        guardrail: this.name,
      };
    }
    return { pass: true, guardrail: this.name };
  },
};

/**
 * Output guardrail: blocks sensitive data in agent responses.
 * Pattern from ab180/agent check_output.
 */
export const outputSanitizer: Guardrail = {
  name: 'output-sanitizer',
  description: 'Blocks internal URLs, secrets, and excessive PII in agent responses',
  check(input: GuardrailInput): GuardrailResult {
    if (input.type !== 'output') return { pass: true, guardrail: this.name };

    const sensitivePatterns = [
      { name: 'API 키', regex: /\b(sk-[a-zA-Z0-9]{20,}|AKIA[A-Z0-9]{16}|ghp_[a-zA-Z0-9]{36})\b/ },
      { name: '내부 URL', regex: /https?:\/\/[a-z0-9.-]*\.(internal|local|corp|private)(:[0-9]+)?/i },
      { name: '연결 문자열', regex: /(postgres|mysql|mongodb|redis):\/\/[^\s]+@[^\s]+/ },
      { name: '내부 IP', regex: /\b(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)\b/ },
      { name: 'JWT 토큰', regex: /eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/ },
    ];

    for (const { name, regex } of sensitivePatterns) {
      if (regex.test(input.text)) {
        return { pass: false, reason: `Sensitive data in output: ${name}`, guardrail: this.name };
      }
    }
    return { pass: true, guardrail: this.name };
  },
};
