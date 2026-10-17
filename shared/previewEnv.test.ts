import { describe, expect, it } from 'vitest';
import { previewEnvChars } from './previewEnv.ts';

// Both sides measure the budget with this, so the settings box and the server always agree on the number.

describe('previewEnvChars', () => {
  it('is nothing for an empty env', () => {
    expect(previewEnvChars({})).toBe(0);
  });

  it('counts KEY=value and the = of each variable', () => {
    expect(previewEnvChars({ PORT: '6301' })).toBe('PORT=6301'.length);
    expect(previewEnvChars({ A: '1', B: '' })).toBe('A=1'.length + 'B='.length);
  });

  it('adds up over the variables', () => {
    expect(previewEnvChars({ A: '1', B: '2', C: '3' })).toBe(previewEnvChars({ A: '1', B: '2' }) + 'C=3'.length);
  });
});
