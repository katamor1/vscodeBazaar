import { describe, expect, it } from 'vitest';
import { buildGraph } from '../src/bazaar/graphModel';
import type { BazaarRevision } from '../src/bazaar/types';

describe('buildGraph', () => {
  it('builds nodes and parent edges for merge history', () => {
    const revisions: BazaarRevision[] = [
      {
        revno: '2',
        revisionId: 'merge',
        parentIds: ['base', 'feature'],
        tags: [],
        committer: 'Alice',
        branchNick: 'main',
        timestamp: 'today',
        message: 'merge',
        depth: 0
      },
      {
        revno: '1.1.1',
        revisionId: 'feature',
        parentIds: ['base'],
        tags: ['topic'],
        committer: 'Bob',
        branchNick: 'feature',
        timestamp: 'today',
        message: 'feature',
        depth: 1
      },
      {
        revno: '1',
        revisionId: 'base',
        parentIds: [],
        tags: [],
        committer: 'Alice',
        branchNick: 'main',
        timestamp: 'yesterday',
        message: 'initial',
        depth: 0
      }
    ];

    expect(buildGraph(revisions)).toEqual({
      nodes: [
        { id: 'merge', revno: '2', label: '2 merge', branchNick: 'main', tags: [], x: 0, y: 0 },
        { id: 'feature', revno: '1.1.1', label: '1.1.1 feature', branchNick: 'feature', tags: ['topic'], x: 1, y: 1 },
        { id: 'base', revno: '1', label: '1 initial', branchNick: 'main', tags: [], x: 0, y: 2 }
      ],
      edges: [
        { from: 'merge', to: 'base' },
        { from: 'merge', to: 'feature' },
        { from: 'feature', to: 'base' }
      ]
    });
  });

  it('uses revno as a safe graph id when revision id is unavailable', () => {
    const revisions: BazaarRevision[] = [
      {
        revno: '3',
        revisionId: '',
        parentIds: [],
        tags: [],
        committer: 'Alice',
        branchNick: 'main',
        timestamp: 'today',
        message: 'missing revid',
        depth: 0
      },
      {
        revno: '',
        revisionId: '',
        parentIds: [],
        tags: [],
        committer: 'Bob',
        branchNick: 'main',
        timestamp: 'today',
        message: 'identityless',
        depth: 0
      }
    ];

    expect(buildGraph(revisions)).toEqual({
      nodes: [
        { id: '3', revno: '3', label: '3 missing revid', branchNick: 'main', tags: [], x: 0, y: 0 }
      ],
      edges: []
    });
  });
});
