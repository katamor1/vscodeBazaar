import { describe, expect, it } from 'vitest';
import { formatRevisionTimestamp } from '../src/views/revisionTime';

describe('formatRevisionTimestamp', () => {
  it('formats Bazaar timestamps to yy/MM/dd HH:mm', () => {
    expect(formatRevisionTimestamp('Fri 2026-05-15 00:03:46 +0900')).toBe('26/05/15 00:03');
  });

  it('formats ISO-like timestamps without timezone conversion', () => {
    expect(formatRevisionTimestamp('2026-05-15T00:03:46.000Z')).toBe('26/05/15 00:03');
  });

  it('returns the original text when it cannot parse the timestamp', () => {
    expect(formatRevisionTimestamp('today')).toBe('today');
  });
});
