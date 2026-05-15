import { describe, expect, it } from 'vitest';
import { parseConflicts, parseStatus, parseUnknownLs } from '../src/bazaar/statusParser';

describe('parseStatus', () => {
  it('groups Bazaar status sections into SCM change kinds', () => {
    const result = parseStatus([
      'modified:',
      '  src/app.ts',
      'added:',
      '  src/new file.ts',
      'removed:',
      '  src/old.ts',
      'unknown:',
      '  scratch.txt',
      'renamed:',
      '  src/before.ts => src/after.ts'
    ].join('\n'));

    expect(result).toEqual([
      { path: 'src/app.ts', kind: 'modified' },
      { path: 'src/new file.ts', kind: 'added' },
      { path: 'src/old.ts', kind: 'removed' },
      { path: 'scratch.txt', kind: 'unknown' },
      { path: 'src/after.ts', kind: 'renamed', oldPath: 'src/before.ts' }
    ]);
  });

  it('ignores empty sections and preserves paths containing spaces', () => {
    const result = parseStatus([
      'modified:',
      'added:',
      '  docs/current spec.md',
      '',
      'unknown:',
      '  memo draft.txt'
    ].join('\n'));

    expect(result).toEqual([
      { path: 'docs/current spec.md', kind: 'added' },
      { path: 'memo draft.txt', kind: 'unknown' }
    ]);
  });
});

describe('parseConflicts', () => {
  it('extracts conflict paths from Bazaar conflict output', () => {
    const result = parseConflicts([
      'Text conflict in src/app.ts',
      'Contents conflict in docs/spec.md',
      'Path conflict: old/name.ts / new/name.ts'
    ].join('\n'));

    expect(result).toEqual([
      { path: 'src/app.ts', description: 'Text conflict in src/app.ts' },
      { path: 'docs/spec.md', description: 'Contents conflict in docs/spec.md' },
      { path: 'old/name.ts / new/name.ts', description: 'Path conflict: old/name.ts / new/name.ts' }
    ]);
  });

  it('returns no conflicts for empty output', () => {
    expect(parseConflicts('\n')).toEqual([]);
  });
});

describe('parseUnknownLs', () => {
  it('turns Bazaar unknown listings into unknown changes', () => {
    expect(parseUnknownLs('unknown.txt\nunknown_dir/\n')).toEqual([
      { path: 'unknown.txt', kind: 'unknown' },
      { path: 'unknown_dir', kind: 'unknown' }
    ]);
  });
});
