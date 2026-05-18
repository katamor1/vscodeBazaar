import { describe, expect, it } from 'vitest';
import {
  createBazaarExploreModel,
  createEmptyBazaarExploreSnapshot,
  extendBazaarExploreHistory,
  type BazaarExploreSnapshot
} from '../src/views/exploreSnapshot';

describe('createBazaarExploreModel', () => {
  it('summarizes status, conflicts, current branch, and revision graph targets', () => {
    const snapshot: BazaarExploreSnapshot = {
      ...createEmptyBazaarExploreSnapshot('C:/work/tree'),
      loadedAt: '2026-05-16T09:00:00.000Z',
      changes: [
        { kind: 'modified', path: 'src/app.ts', description: 'modified' },
        { kind: 'unknown', path: 'tmp/out.txt' },
        { kind: 'pendingMerge', path: 'Pending merge' }
      ],
      conflicts: [
        { path: 'src/conflict.ts', description: 'text conflict' }
      ],
      branches: [
        { name: 'trunk', path: 'C:/work/tree', current: true },
        { name: 'feature', path: 'C:/work/feature', current: false }
      ],
      tags: [
        { name: 'v1', revision: '1' }
      ],
      shelves: [
        { id: '1', message: 'shelf work' }
      ],
      revisions: [
        {
          revno: '2',
          revisionId: 'rev-2',
          parentIds: ['rev-1'],
          tags: ['tip'],
          committer: 'Alice',
          branchNick: 'trunk',
          timestamp: 'today',
          message: 'second line\nbody',
          depth: 0,
          changedPaths: ['src/app.ts']
        }
      ],
      graph: {
        nodes: [{ id: 'rev-2', revno: '2', label: '2 second line', branchNick: 'trunk', tags: ['tip'], x: 0, y: 0 }],
        edges: []
      },
      info: {
        branchRoot: 'C:/work/tree',
        parentBranch: '../parent'
      }
    };

    const model = createBazaarExploreModel(snapshot);

    expect(model.health).toBe('conflict');
    expect(model.headline).toBe('競合あり');
    expect(model.counts).toMatchObject({
      changes: 3,
      conflicts: 1,
      branches: 2,
      tags: 1,
      shelves: 1,
      revisions: 1,
      pendingMerges: 1,
      unknown: 1
    });
    expect(model.statusGroups.map((group) => [group.id, group.items.length])).toEqual([
      ['conflict', 1],
      ['pendingMerge', 1],
      ['modified', 1],
      ['unknown', 1]
    ]);
    expect(model.currentBranch?.name).toBe('trunk');
    expect(model.revisions[0]).toMatchObject({
      graphId: 'rev-2',
      summary: 'second line',
      changedPaths: ['src/app.ts']
    });
    expect(model.infoItems.map((item) => item.label)).toEqual([
      'Branch root',
      'Parent branch'
    ]);
  });

  it('marks partial snapshots when a source failed but no conflict is loaded', () => {
    const model = createBazaarExploreModel({
      ...createEmptyBazaarExploreSnapshot('C:/work/tree'),
      errors: [{ source: 'history', message: 'failed' }]
    });

    expect(model.health).toBe('partial');
    expect(model.headline).toBe('一部未読込');
  });

  it('extends only history and graph during EXPLORE load-more', () => {
    const snapshot: BazaarExploreSnapshot = {
      ...createEmptyBazaarExploreSnapshot('C:/work/tree'),
      loadedAt: '2026-05-16T09:00:00.000Z',
      changes: [{ kind: 'modified', path: 'src/app.ts' }],
      branches: [{ name: 'trunk', path: 'C:/work/tree', current: true }],
      revisions: [{
        revno: '1',
        revisionId: 'rev-1',
        parentIds: [],
        tags: [],
        committer: 'Alice',
        branchNick: 'trunk',
        timestamp: 'Fri 2026-05-15 00:01:00 +0900',
        message: 'initial',
        depth: 0
      }]
    };
    const extended = extendBazaarExploreHistory(snapshot, [{
      revno: '2',
      revisionId: 'rev-2',
      parentIds: ['rev-1'],
      tags: [],
      committer: 'Alice',
      branchNick: 'trunk',
      timestamp: 'Fri 2026-05-15 00:02:00 +0900',
      message: 'second',
      depth: 0
    }, ...snapshot.revisions]);

    expect(extended.changes).toBe(snapshot.changes);
    expect(extended.branches).toBe(snapshot.branches);
    expect(extended.revisions.map((revision) => revision.revno)).toEqual(['2', '1']);
    expect(extended.graph.nodes.map((node) => node.id)).toEqual(['rev-2', 'rev-1']);
  });
});
