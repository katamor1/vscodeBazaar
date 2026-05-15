import { describe, expect, it } from 'vitest';
import { resolveGraphRevisionMessage } from '../src/views/graphMessage';
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
  depth: 0,
  changedPaths: ['src/app.ts']
};

describe('resolveGraphRevisionMessage', () => {
  it('resolves graph messages to valid revision commands', () => {
    expect(resolveGraphRevisionMessage([revision], { command: 'showCommit', revisionId: 'rev-3' })).toEqual({
      command: 'showCommit',
      revision
    });
    expect(resolveGraphRevisionMessage([revision], { command: 'showDiff', revisionId: 'rev-3', path: 'src/app.ts' })).toEqual({
      command: 'showDiff',
      revision,
      path: 'src/app.ts'
    });
  });

  it('allows graph nodes keyed by revno when revision id is unavailable', () => {
    const revisionIdOnly = { ...revision, revno: '4', revisionId: '' };

    expect(resolveGraphRevisionMessage([revisionIdOnly], { command: 'showCommit', revisionId: '4' })).toEqual({
      command: 'showCommit',
      revision: revisionIdOnly
    });
  });

  it('returns no command for missing or invalid revision targets', () => {
    expect(resolveGraphRevisionMessage([revision], { command: 'showCommit', revisionId: undefined })).toBeUndefined();
    expect(resolveGraphRevisionMessage([revision], { command: 'showDiff', revisionId: 'undefined' })).toBeUndefined();
    expect(resolveGraphRevisionMessage([{ ...revision, revno: '', revisionId: '' }], { command: 'showCommit', revisionId: '' })).toBeUndefined();
  });

  it('preserves refresh messages without requiring a revision', () => {
    expect(resolveGraphRevisionMessage([], { command: 'refresh' })).toEqual({ command: 'refresh' });
  });
});
