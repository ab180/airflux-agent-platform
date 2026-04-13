/**
 * PII post-masking utility.
 * Replaces detected PII patterns in text with masked versions.
 * Unlike the guardrail (which blocks), this masks and passes through.
 */

interface MaskResult {
  text: string;
  masked: boolean;
  maskedCount: number;
  types: string[];
}

const PII_PATTERNS: { name: string; regex: RegExp; mask: string }[] = [
  {
    name: '주민등록번호',
    regex: /\d{6}-[1-4]\d{6}/g,
    mask: '******-*******',
  },
  {
    name: '전화번호',
    regex: /01[016789]-?\d{3,4}-?\d{4}/g,
    mask: '010-****-****',
  },
  {
    name: '이메일',
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    mask: '***@***.***',
  },
  {
    name: '신용카드',
    regex: /\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/g,
    mask: '****-****-****-****',
  },
];

export function maskPii(text: string): MaskResult {
  let result = text;
  let totalMasked = 0;
  const detectedTypes: string[] = [];

  for (const { name, regex, mask } of PII_PATTERNS) {
    const matches = result.match(regex);
    if (matches && matches.length > 0) {
      result = result.replace(regex, mask);
      totalMasked += matches.length;
      if (!detectedTypes.includes(name)) {
        detectedTypes.push(name);
      }
    }
  }

  return {
    text: result,
    masked: totalMasked > 0,
    maskedCount: totalMasked,
    types: detectedTypes,
  };
}
