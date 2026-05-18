import { describe, expect, it } from 'vitest';
import { createGraphPayload } from '../src/views/graphPayload';
import type { BazaarRevision, RevisionGraph } from '../src/bazaar/types';

const graph: RevisionGraph = {
  nodes: [{ id: 'rev-1', revno: '1', label: '1 initial', branchNick: 'trunk', tags: [], x: 0, y: 0 }],
  edges: []
};

const revision: BazaarRevision = {
  revno: '1',
  revisionId: 'rev-1',
  parentIds: [],
  tags: [],
  committer: 'Alice',
  branchNick: 'trunk',
  timestamp: 'Fri 2026-05-15 00:03:46 +0900',
  message: 'initial',
  depth: 0
};

describe('createGraphPayload', () => {
  it('includes display timestamps and load-more state', () => {
    const payload = createGraphPayload(graph, [revision], 1);

    expect(payload.canLoadMore).toBe(true);
    expect(payload.revisions[0]).toMatchObject({
      graphId: 'rev-1',
      timestamp: 'Fri 2026-05-15 00:03:46 +0900',
      displayTimestamp: '26/05/15 00:03'
    });
  });
});
