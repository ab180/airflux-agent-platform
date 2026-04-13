import { describe, it, expect } from 'vitest';
import { maskPii } from '../utils/pii-masker.js';

describe('maskPii', () => {
  it('masks Korean resident IDs', () => {
    const result = maskPii('주민번호는 901231-1234567입니다');
    expect(result.masked).toBe(true);
    expect(result.text).toContain('******-*******');
    expect(result.text).not.toContain('901231');
    expect(result.types).toContain('주민등록번호');
  });

  it('masks phone numbers', () => {
    const result = maskPii('연락처: 010-1234-5678');
    expect(result.masked).toBe(true);
    expect(result.text).toContain('010-****-****');
    expect(result.text).not.toContain('1234-5678');
  });

  it('masks email addresses', () => {
    const result = maskPii('이메일: user@example.com');
    expect(result.masked).toBe(true);
    expect(result.text).toContain('***@***.***');
    expect(result.text).not.toContain('user@example.com');
  });

  it('masks credit card numbers', () => {
    const result = maskPii('카드: 1234-5678-9012-3456');
    expect(result.masked).toBe(true);
    expect(result.text).toContain('****-****-****-****');
  });

  it('masks multiple PII types in one text', () => {
    const result = maskPii('전화 010-1234-5678, 이메일 test@mail.com');
    expect(result.maskedCount).toBe(2);
    expect(result.types).toHaveLength(2);
  });

  it('returns unchanged text when no PII', () => {
    const result = maskPii('앱 123의 DAU를 알려줘');
    expect(result.masked).toBe(false);
    expect(result.maskedCount).toBe(0);
    expect(result.text).toBe('앱 123의 DAU를 알려줘');
  });

  it('handles empty string', () => {
    const result = maskPii('');
    expect(result.masked).toBe(false);
  });
});
