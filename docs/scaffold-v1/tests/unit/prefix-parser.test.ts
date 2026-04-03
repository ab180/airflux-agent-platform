import { describe, it, expect } from 'vitest';
import { parseUserInput } from '../../src/utils/prefix-parser';

describe('parseUserInput', () => {
  it('should detect debug prefix', () => {
    const result = parseUserInput('debug: DAU 알려줘');
    expect(result.debug).toBe(true);
    expect(result.cleanText).toBe('DAU 알려줘');
  });

  it('should detect explain prefix', () => {
    const result = parseUserInput('explain: 매출이 왜 떨어졌어?');
    expect(result.explain).toBe(true);
    expect(result.cleanText).toBe('매출이 왜 떨어졌어?');
  });

  it('should detect sql prefix', () => {
    const result = parseUserInput('sql: SELECT * FROM events LIMIT 10');
    expect(result.rawSQL).toBe(true);
    expect(result.cleanText).toBe('SELECT * FROM events LIMIT 10');
  });

  it('should handle no prefix', () => {
    const result = parseUserInput('쿠팡 앱 DAU 알려줘');
    expect(result.debug).toBe(false);
    expect(result.explain).toBe(false);
    expect(result.rawSQL).toBe(false);
    expect(result.cleanText).toBe('쿠팡 앱 DAU 알려줘');
  });

  it('should remove bot mentions', () => {
    const result = parseUserInput('<@U12345ABC> DAU 알려줘');
    expect(result.cleanText).toBe('DAU 알려줘');
  });

  it('should handle prefix with colon and space', () => {
    expect(parseUserInput('debug:DAU').debug).toBe(true);
    expect(parseUserInput('debug: DAU').debug).toBe(true);
    expect(parseUserInput('debug DAU').debug).toBe(true);
    expect(parseUserInput('DEBUG: DAU').debug).toBe(true);
  });

  it('should handle mention + prefix combo', () => {
    const result = parseUserInput('<@UBOT123> debug: 쿠팡 DAU');
    expect(result.debug).toBe(true);
    expect(result.cleanText).toBe('쿠팡 DAU');
  });

  it('should not false-positive on "debugging" or "explanation"', () => {
    const result1 = parseUserInput('debugging 방법 알려줘');
    expect(result1.debug).toBe(false);

    const result2 = parseUserInput('explanation이 뭐야');
    expect(result2.explain).toBe(false);
  });
});
