import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createCharacterUnlockVerifier, normalizeCharacterUnlockCode } from './characterUnlockCodes.js';

describe('character unlock code verifier', () => {
  const testCode = `BH-TEST-${'A'.repeat(26)}`;
  const normalized = testCode.replace(/[\s-]+/g, '').toUpperCase();
  const hash = createHash('sha256').update(normalized, 'ascii').digest('hex');
  const verify = createCharacterUnlockVerifier(new Map([[hash, 7]]));

  it('accepts a code case-insensitively and ignores spaces or separators', () => {
    expect(verify(`  ${testCode.toLowerCase().replace(/-/g, ' ')}  `)).toBe(7);
  });

  it('rejects invalid, malformed, or non-string input without returning an unlock', () => {
    expect(verify('not-a-code')).toBeNull();
    expect(verify(`${testCode}!`)).toBeNull();
    expect(verify('A'.repeat(97))).toBeNull();
    expect(verify(null)).toBeNull();
    expect(verify({ code: testCode })).toBeNull();
  });

  it('normalizes only codes with the expected high-entropy length', () => {
    expect(normalizeCharacterUnlockCode(testCode)).toBe(normalized);
    expect(normalizeCharacterUnlockCode('short')).toBeNull();
  });
});
