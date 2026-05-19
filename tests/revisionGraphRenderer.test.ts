import { describe, expect, it } from 'vitest';
import { renderRevisionGraphSvg } from '../src/views/revisionGraphRenderer';
import type { RevisionGraph } from '../src/bazaar/types';
import type { GraphPayloadRevision } from '../src/views/graphPayload';

const graph: RevisionGraph = {
  nodes: [{ id: 'rev-2', revno: '2', label: '2 second', branchNick: 'trunk', tags: ['tip'], x: 1, y: 0 }],
  edges: [{ from: 'rev-2', to: 'rev-1' }]
};

const revisions: GraphPayloadRevision[] = [{
  graphId: 'rev-2',
  revno: '2',
  committer: 'Alice',
  timestamp: 'Fri 2026-05-15 00:03:46 +0900',
  displayTimestamp: '26/05/15 00:03',
  branchNick: 'trunk',
  tags: ['tip'],
  parents: ['rev-1'],
  message: 'second',
  changedPaths: ['src/app.ts']
}];

describe('renderRevisionGraphSvg', () => {
  it('renders the shared lane and label layout used by graph and EXPLORE views', () => {
    const html = renderRevisionGraphSvg(graph, revisions);

    expect(html).toContain('class="graph-node"');
    expect(html).toContain('data-revision-id="rev-2"');
    expect(html).toContain('class="graph-label"');
    expect(html).toContain('class="graph-label-meta"');
    expect(html).toContain('26/05/15 00:03 / Alice / trunk / #tip');
  });

  it.each([
    { laneCount: 3, expectedNodeXs: [24, 66, 108], expectedLabelX: 214 },
    { laneCount: 4, expectedNodeXs: [24, 66, 108, 150], expectedLabelX: 214 }
  ])('keeps labels clear of the graph lane with $laneCount lanes', ({ laneCount, expectedNodeXs, expectedLabelX }) => {
    const html = renderRevisionGraphSvg(createLaneGraph(laneCount), createLaneRevisions(laneCount));

    const nodeXs = Array.from(html.matchAll(/<circle cx="(\d+)"/g), (match) => Number(match[1]));
    const labelXs = Array.from(html.matchAll(/class="graph-label" x="(\d+)"/g), (match) => Number(match[1]));

    expect(nodeXs).toEqual(expectedNodeXs);
    expect([...new Set(labelXs)]).toEqual([expectedLabelX]);
    expect(expectedLabelX).toBeGreaterThan(Math.max(...expectedNodeXs) + 40);
  });

  it('moves the label lane farther right after four visible graph lanes', () => {
    const html = renderRevisionGraphSvg(createLaneGraph(5), createLaneRevisions(5));

    const nodeXs = Array.from(html.matchAll(/<circle cx="(\d+)"/g), (match) => Number(match[1]));
    const labelXs = Array.from(html.matchAll(/class="graph-label" x="(\d+)"/g), (match) => Number(match[1]));

    expect(nodeXs).toEqual([24, 66, 108, 150, 192]);
    expect([...new Set(labelXs)]).toEqual([240]);
    expect(240).toBeGreaterThan(Math.max(...nodeXs) + 40);
  });
});

function createLaneGraph(laneCount: number): RevisionGraph {
  return {
    nodes: Array.from({ length: laneCount }, (_, index) => ({
      id: `lane-${index + 1}`,
      revno: String(index + 1),
      label: `${index + 1} lane ${index + 1}`,
      branchNick: `branch-${index + 1}`,
      tags: index === 0 ? ['tip'] : [],
      x: index,
      y: index
    })),
    edges: Array.from({ length: laneCount - 1 }, (_, index) => ({
      from: `lane-${index + 1}`,
      to: `lane-${index + 2}`
    }))
  };
}

function createLaneRevisions(laneCount: number): GraphPayloadRevision[] {
  return Array.from({ length: laneCount }, (_, index) => ({
    graphId: `lane-${index + 1}`,
    revno: String(index + 1),
    committer: `User ${index + 1}`,
    timestamp: 'Fri 2026-05-15 00:03:46 +0900',
    displayTimestamp: '26/05/15 00:03',
    branchNick: `branch-${index + 1}`,
    tags: index === 0 ? ['tip'] : [],
    parents: index === laneCount - 1 ? [] : [`lane-${index + 2}`],
    message: `lane ${index + 1}`,
    changedPaths: []
  }));
}
