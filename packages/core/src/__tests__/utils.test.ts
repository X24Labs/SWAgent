import { describe, it, expect } from 'vitest';
import { estimateTokens } from '../core/utils.js';

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('returns 1 for 4-char string', () => {
    expect(estimateTokens('test')).toBe(1);
  });

  it('returns 2 for 8-char string', () => {
    expect(estimateTokens('testtest')).toBe(2);
  });

  it('returns 3 for 9-char string (ceiling)', () => {
    expect(estimateTokens('testtests')).toBe(3);
  });

  it('returns ~250 for typical llms.txt string (~1000 chars)', () => {
    const text = 'a'.repeat(1000);
    expect(estimateTokens(text)).toBe(250);
  });
});
