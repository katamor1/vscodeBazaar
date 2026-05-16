import { describe, expect, it } from 'vitest';
import { createHistoryCommitDiffPlan } from '../src/views/historyDiff';
import type { BazaarRevision } from '../src/bazaar/types';

const revision: BazaarRevision = {
  revno: '12',
  revisionId: 'rev-12',
  parentIds: ['parent-11'],
  tags: [],
  committer: 'Alice',
  branchNick: 'main',
  timestamp: 'today',
  message: 'change',
  depth: 0
};

describe('createHistoryCommitDiffPlan', () => {
  it('opens a file diff when a changed path is selected', () => {
    expect(createHistoryCommitDiffPlan(revision, 'src/file.ts')).toEqual({
      kind: 'fileDiff',
      title: 'src/file.ts (12)',
      changedPath: 'src/file.ts',
      leftRevision: 'revid:parent-11',
      rightRevision: 'revid:rev-12'
    });
  });

  it('opens the whole commit diff as a diff document instead of OutputChannel content', () => {
    expect(createHistoryCommitDiffPlan(revision, undefined)).toEqual({
      kind: 'patchDocument',
      title: 'Bazaar commit diff 12',
      revisionSpec: '12'
    });
  });

  it('uses an empty left side for root revision file diffs', () => {
    expect(createHistoryCommitDiffPlan({ ...revision, parentIds: [] }, 'README.md')).toEqual({
      kind: 'fileDiff',
      title: 'README.md (12)',
      changedPath: 'README.md',
      leftRevision: 'before:12',
      leftEmpty: true,
      rightRevision: 'revid:rev-12'
    });
  });

  it('rejects invalid revision identities', () => {
    expect(createHistoryCommitDiffPlan({ ...revision, revno: '', revisionId: '' }, undefined)).toBeUndefined();
  });
});
