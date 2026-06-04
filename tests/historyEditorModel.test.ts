import { describe, expect, it } from 'vitest';
import { createHistoryEditorPayload } from '../src/views/historyEditorModel';
import type { BazaarRevision } from '../src/bazaar/types';

const revision: BazaarRevision = {
  revno: '2',
  revisionId: 'rev-2',
  parentIds: ['rev-1'],
  tags: ['tip'],
  committer: 'Alice',
  branchNick: 'trunk',
  timestamp: 'Fri 2026-05-15 00:03:46 +0900',
  message: 'second line\nbody',
  depth: 0,
  changedPaths: ['src/app.ts']
};

const initialRevision: BazaarRevision = {
  ...revision,
  revno: '1',
  revisionId: 'rev-1',
  parentIds: [],
  tags: [],
  timestamp: 'Fri 2026-05-15 00:01:00 +0900',
  message: 'initial',
  changedPaths: []
};

describe('createHistoryEditorPayload', () => {
  it('creates a list-detail payload with display timestamps and load-more state', () => {
    const payload = createHistoryEditorPayload([revision], {
      limit: 1,
      pathFilter: 'src/app.ts',
      loading: false
    });

    expect(payload).toMatchObject({
      limit: 1,
      pathFilter: 'src/app.ts',
      canLoadMore: true,
      loading: false
    });
    expect(payload.revisions[0]).toMatchObject({
      graphId: 'rev-2',
      revno: '2',
      summary: 'second line',
      displayTimestamp: '26/05/15 00:03',
      changedPaths: ['src/app.ts']
    });
  });

  it('does not advertise load-more when revision 1 is visible at the end', () => {
    const payload = createHistoryEditorPayload([revision, initialRevision], {
      limit: 1,
      loading: false
    });

    expect(payload.canLoadMore).toBe(false);
  });
});
