import { describe, expect, it } from 'vitest';
import {
  resolveRevisionCommandTarget,
  revisionSpecForCommand,
  revisionSpecForDocument
} from '../src/views/historyTarget';
import type { BazaarRevision } from '../src/bazaar/types';

const revision: BazaarRevision = {
  revno: '3',
  revisionId: 'rev-3',
  parentIds: [],
  tags: [],
  committer: 'Alice',
  branchNick: 'main',
  timestamp: 'today',
  message: 'work',
  depth: 0
};

describe('resolveRevisionCommandTarget', () => {
  it('accepts direct Bazaar revisions from tree item commands', () => {
    expect(resolveRevisionCommandTarget(revision)).toBe(revision);
  });

  it('unwraps revision tree nodes from view item context commands', () => {
    expect(resolveRevisionCommandTarget({ type: 'revision', revision })).toBe(revision);
  });

  it('rejects missing or non-revision command targets', () => {
    expect(resolveRevisionCommandTarget(undefined)).toBeUndefined();
    expect(resolveRevisionCommandTarget({ type: 'detail', label: 'Show commit diff' })).toBeUndefined();
    expect(resolveRevisionCommandTarget({ revisionId: 'rev-3' })).toBeUndefined();
  });

  it('accepts revisions that only have a revision id and rejects identityless revisions', () => {
    const revisionIdOnly = { ...revision, revno: '', revisionId: 'rev-3-only' };

    expect(resolveRevisionCommandTarget(revisionIdOnly)).toBe(revisionIdOnly);
    expect(resolveRevisionCommandTarget({ ...revision, revno: '', revisionId: '' })).toBeUndefined();
    expect(resolveRevisionCommandTarget({ ...revision, revno: '   ', revisionId: '   ' })).toBeUndefined();
  });

  it('builds command and document revision specs without returning empty values', () => {
    expect(revisionSpecForCommand(revision)).toBe('3');
    expect(revisionSpecForDocument(revision)).toBe('revid:rev-3');
    expect(revisionSpecForCommand({ ...revision, revno: '', revisionId: 'rev-3-only' })).toBe('revid:rev-3-only');
    expect(revisionSpecForDocument({ ...revision, revno: '', revisionId: 'rev-3-only' })).toBe('revid:rev-3-only');
    expect(revisionSpecForCommand({ ...revision, revno: '', revisionId: '' })).toBeUndefined();
    expect(revisionSpecForDocument({ ...revision, revno: '', revisionId: '' })).toBeUndefined();
  });
});
