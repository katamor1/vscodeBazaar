import { describe, expect, it } from 'vitest';
import { revisionSpecForBlameAnnotation } from '../src/views/blameTarget';

describe('revisionSpecForBlameAnnotation', () => {
  it('uses a normalized blame revno for Bazaar commands', () => {
    expect(revisionSpecForBlameAnnotation({ revno: ' 12.3.1 ' })).toBe('12.3.1');
  });

  it('rejects missing placeholder revisions before Bazaar commands are built', () => {
    expect(revisionSpecForBlameAnnotation(undefined)).toBeUndefined();
    expect(revisionSpecForBlameAnnotation({ revno: '' })).toBeUndefined();
    expect(revisionSpecForBlameAnnotation({ revno: 'undefined' })).toBeUndefined();
    expect(revisionSpecForBlameAnnotation({ revno: 'null' })).toBeUndefined();
    expect(revisionSpecForBlameAnnotation({ revno: '?' })).toBeUndefined();
    expect(revisionSpecForBlameAnnotation({ revno: '-' })).toBeUndefined();
  });
});
