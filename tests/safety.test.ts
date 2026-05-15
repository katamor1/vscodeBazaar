import { describe, expect, it } from 'vitest';
import { confirmationMatches, confirmationPhraseFor } from '../src/bazaar/safety';

describe('dangerous operation confirmation helpers', () => {
  it('requires exact typed confirmation when configured', () => {
    const phrase = confirmationPhraseFor({ id: 'clean-tree', label: 'Clean unknown files', target: 'unknown' });

    expect(phrase).toBe('Clean unknown files: unknown');
    expect(confirmationMatches(phrase, phrase, true)).toBe(true);
    expect(confirmationMatches(phrase.toLowerCase(), phrase, true)).toBe(false);
  });

  it('allows modal-only confirmation when typed confirmation is disabled', () => {
    expect(confirmationMatches('', 'Break Bazaar lock: .', false)).toBe(true);
  });
});
