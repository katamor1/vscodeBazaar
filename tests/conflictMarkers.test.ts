import { describe, expect, it } from 'vitest';
import { resolveTextConflictMarkers } from '../src/bazaar/conflictMarkers';

describe('resolveTextConflictMarkers', () => {
  const conflicted = [
    'before',
    '<<<<<<< TREE',
    'this line',
    '=======',
    'other line',
    '>>>>>>> MERGE-SOURCE',
    'after'
  ].join('\n');

  it('keeps the current side only', () => {
    expect(resolveTextConflictMarkers(conflicted, 'this')).toEqual({
      content: ['before', 'this line', 'after'].join('\n'),
      resolvedCount: 1
    });
  });

  it('keeps the incoming side only', () => {
    expect(resolveTextConflictMarkers(conflicted, 'other')).toEqual({
      content: ['before', 'other line', 'after'].join('\n'),
      resolvedCount: 1
    });
  });

  it('keeps both sides with the current side first', () => {
    expect(resolveTextConflictMarkers(conflicted, 'both-this-first')).toEqual({
      content: ['before', 'this line', 'other line', 'after'].join('\n'),
      resolvedCount: 1
    });
  });

  it('keeps both sides with the current side last', () => {
    expect(resolveTextConflictMarkers(conflicted, 'both-this-last')).toEqual({
      content: ['before', 'other line', 'this line', 'after'].join('\n'),
      resolvedCount: 1
    });
  });

  it('resolves multiple CRLF conflict blocks without changing unrelated text', () => {
    const input = [
      'a',
      '<<<<<<< TREE',
      'x',
      '=======',
      'y',
      '>>>>>>> MERGE-SOURCE',
      'b',
      '<<<<<<< local',
      '1',
      '=======',
      '2',
      '>>>>>>> remote',
      'c'
    ].join('\r\n');

    expect(resolveTextConflictMarkers(input, 'both-this-last')).toEqual({
      content: ['a', 'y', 'x', 'b', '2', '1', 'c'].join('\r\n'),
      resolvedCount: 2
    });
  });

  it('leaves content untouched when no conflict markers exist', () => {
    expect(resolveTextConflictMarkers('plain text\n', 'both-this-first')).toEqual({
      content: 'plain text\n',
      resolvedCount: 0
    });
  });
});
