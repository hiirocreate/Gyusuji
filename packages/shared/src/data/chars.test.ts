import { describe, expect, it } from 'vitest';
import { charUnlocked, characterCodeUnlockKey } from './chars.js';

describe('character unlocks', () => {
  it('preserves achievement-based unlocks and adds code-based unlocks', () => {
    expect(charUnlocked(5, ['all5'])).toBe(true);
    expect(charUnlocked(5, [characterCodeUnlockKey('hunter')])).toBe(true);
    expect(charUnlocked(6, [characterCodeUnlockKey('chef')])).toBe(true);
    expect(charUnlocked(7, [characterCodeUnlockKey('clown')])).toBe(true);
  });

  it('does not unlock a character from another character code marker', () => {
    expect(charUnlocked(7, [characterCodeUnlockKey('hunter')])).toBe(false);
    expect(charUnlocked(7, [])).toBe(false);
  });
});
