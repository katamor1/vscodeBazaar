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

const nextRevision: BazaarRevision = {
  ...revision,
  revno: '2',
  revisionId: 'rev-2',
  parentIds: ['rev-1'],
  message: 'second'
};

describe('createGraphPayload', () => {
  it('includes display timestamps and load-more state', () => {
    const payload = createGraphPayload(graph, [revision], {
      limit: 1,
      loading: true
    });

    expect(payload.canLoadMore).toBe(false);
    expect(payload.loading).toBe(true);
    expect(payload.revisions[0]).toMatchObject({
      graphId: 'rev-1',
      timestamp: 'Fri 2026-05-15 00:03:46 +0900',
      displayTimestamp: '26/05/15 00:03'
    });
    expect(payload.graphHtml).toContain('class="graph-node"');
    expect(payload.graphHtml).toContain('26/05/15 00:03');
  });

  it('advertises load-more when the visible tail is not revision 1', () => {
    const payload = createGraphPayload({
      nodes: [{ id: 'rev-2', revno: '2', label: '2 second', branchNick: 'trunk', tags: [], x: 0, y: 0 }],
      edges: []
    }, [nextRevision], {
      limit: 10,
      loading: false
    });

    expect(payload.canLoadMore).toBe(true);
  });
});
