import { describe, expect, it } from 'vitest';
import {
  createComparisonToWorkingFileTarget,
  createPreviousRevisionDiffTarget,
  createWorkingFileDiffTarget
} from '../src/views/blameDiff';
import type { BazaarRevision } from '../src/bazaar/types';

const revision: BazaarRevision = {
  revno: '7',
  revisionId: 'rev-7',
  parentIds: ['parent-6'],
  tags: [],
  committer: 'Alice',
  branchNick: 'main',
  timestamp: 'today',
  message: 'work',
  depth: 0
};

describe('createBlameDiffEditorTarget', () => {
  it('opens the first parent against the blamed revision in the diff editor', () => {
    expect(createPreviousRevisionDiffTarget(revision, '7')).toEqual({
      left: { kind: 'revision', revision: 'revid:parent-6' },
      right: { kind: 'revision', revision: 'revid:rev-7' },
      label: '7',
      mode: 'previous'
    });
  });

  it('uses an empty left side for a root revision', () => {
    expect(createPreviousRevisionDiffTarget({ ...revision, parentIds: [] }, '7')).toEqual({
      left: { kind: 'empty', revision: 'before:7' },
      right: { kind: 'revision', revision: 'revid:rev-7' },
      label: '7',
      mode: 'previous'
    });
  });

  it('falls back to the annotation revision when log metadata has no revision id', () => {
    expect(createPreviousRevisionDiffTarget({ ...revision, revisionId: '' }, '7')).toEqual({
      left: { kind: 'revision', revision: 'revid:parent-6' },
      right: { kind: 'revision', revision: '7' },
      label: '7',
      mode: 'previous'
    });
  });

  it('rejects targets that cannot produce a right-side revision', () => {
    expect(createPreviousRevisionDiffTarget({ ...revision, revno: '', revisionId: '' }, '')).toBeUndefined();
  });

  it('opens blamed revision against the working file', () => {
    expect(createWorkingFileDiffTarget(revision, '7')).toEqual({
      left: { kind: 'revision', revision: 'revid:rev-7' },
      right: { kind: 'working' },
      label: '7',
      mode: 'working'
    });
  });

  it('rejects working file diffs when revision metadata and fallback are invalid', () => {
    const invalidRevision = { ...revision, revno: '', revisionId: 'undefined' };

    expect(createWorkingFileDiffTarget(invalidRevision, 'undefined')).toBeUndefined();
    expect(createWorkingFileDiffTarget(invalidRevision, 'null')).toBeUndefined();
  });

  it('opens an arbitrary comparison revision against the working file', () => {
    expect(createComparisonToWorkingFileTarget(' tag:release ', 'Release')).toEqual({
      left: { kind: 'revision', revision: 'tag:release' },
      right: { kind: 'working' },
      label: 'Release',
      mode: 'comparison'
    });
  });

  it('rejects invalid comparison revisions before building a diff target', () => {
    expect(createComparisonToWorkingFileTarget('undefined', 'bad')).toBeUndefined();
  });

  it('rejects placeholder comparison revisions before building a diff target', () => {
    expect(createComparisonToWorkingFileTarget('null', 'bad')).toBeUndefined();
    expect(createComparisonToWorkingFileTarget('?', 'bad')).toBeUndefined();
    expect(createComparisonToWorkingFileTarget('-', 'bad')).toBeUndefined();
  });
});
