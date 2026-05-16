import { describe, expect, it } from 'vitest';
import { parseAnnotations, parseBranches, parseInfo, parseTags } from '../src/bazaar/metadataParser';

describe('parseTags', () => {
  it('parses Bazaar tag table output', () => {
    expect(parseTags('v1                   2\nrelease candidate    3\n')).toEqual([
      { name: 'v1', revision: '2' },
      { name: 'release candidate', revision: '3' }
    ]);
  });
});

describe('parseBranches', () => {
  it('marks the current branch from Bazaar branch output', () => {
    expect(parseBranches('feature\n* main\nlegacy\n', 'main')).toEqual([
      { name: 'feature', path: 'feature', current: false },
      { name: 'main', path: 'main', current: true },
      { name: 'legacy', path: 'legacy', current: false }
    ]);
  });

  it('falls back to the current nickname when branches are not listed', () => {
    expect(parseBranches('', 'bazaar_test')).toEqual([
      { name: 'bazaar_test', path: '.', current: true }
    ]);
  });
});

describe('parseInfo', () => {
  it('extracts branch root and repository checkout hints', () => {
    expect(parseInfo('Standalone tree (format: 2a)\nLocation:\n  branch root: .\n  repository: ..\n')).toEqual({
      branchRoot: '.',
      repository: '..',
      checkoutRoot: undefined
    });
  });

  it('extracts lightweight checkout roots from Bazaar info output', () => {
    expect(parseInfo('Lightweight checkout (format: 2a)\nLocation:\n  light checkout root: .\n   checkout of branch: C:/repo/branch1\n    shared repository: C:/repo\n')).toEqual({
      branchRoot: undefined,
      repository: 'C:/repo',
      checkoutRoot: '.',
      checkoutOfBranch: 'C:/repo/branch1'
    });
  });
});

describe('parseAnnotations', () => {
  it('parses all-line annotate output into line metadata', () => {
    expect(parseAnnotations('1   alice | first line\n2   bob   | second line\n')).toEqual([
      { line: 1, revno: '1', author: 'alice', text: 'first line' },
      { line: 2, revno: '2', author: 'bob', text: 'second line' }
    ]);
  });
});
