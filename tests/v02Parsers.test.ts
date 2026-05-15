import { describe, expect, it } from 'vitest';
import { parseAnnotations, parseCleanTreeDryRun, parseConflictTextPaths, parseShelves } from '../src/bazaar/metadataParser';

describe('V0.2 Bazaar metadata parsers', () => {
  it('parses shelf list output', () => {
    expect(parseShelves('  1: work in progress\n  2: docs update\n')).toEqual([
      { id: '1', message: 'work in progress' },
      { id: '2', message: 'docs update' }
    ]);
  });

  it('parses clean-tree dry-run output with an assigned kind', () => {
    expect(parseCleanTreeDryRun('deleting paths:\n  scratch.txt\n  build/out.js\n', 'unknown')).toEqual([
      { path: 'scratch.txt', kind: 'unknown' },
      { path: 'build/out.js', kind: 'unknown' }
    ]);
  });

  it('parses text conflict paths', () => {
    expect(parseConflictTextPaths('src/app.ts\n docs/spec.md \n\n')).toEqual([
      'src/app.ts',
      'docs/spec.md'
    ]);
  });

  it('keeps optional date metadata from long annotations', () => {
    expect(parseAnnotations('12   alice 2026-05-15 | line text\n')).toEqual([
      { line: 1, revno: '12', author: 'alice', date: '2026-05-15', text: 'line text' }
    ]);
  });
});
