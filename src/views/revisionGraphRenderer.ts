import type { RevisionGraph } from '../bazaar/types';

export interface RevisionGraphRenderRevision {
  graphId: string;
  committer: string;
  timestamp: string;
  displayTimestamp?: string;
  branchNick: string;
  tags: readonly string[];
}

export function renderRevisionGraphSvg(
  graph: RevisionGraph,
  revisions: readonly RevisionGraphRenderRevision[]
): string {
  if (graph.nodes.length === 0) {
    return '';
  }

  const rowHeight = 42;
  const columnWidth = 42;
  const maxLane = Math.max(0, ...graph.nodes.map((node) => node.x));
  const graphLaneWidth = Math.max(190, 48 + maxLane * columnWidth);
  const labelLaneX = graphLaneWidth + 24;
  const radius = 7;
  const width = Math.max(720, labelLaneX + 520);
  const height = Math.max(160, graph.nodes.length * rowHeight + 40);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const revisionByGraphId = new Map(revisions.map((revision) => [revision.graphId, revision]));

  const edgeSvg = graph.edges.map((edge) => {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) {
      return '';
    }
    const x1 = 24 + from.x * columnWidth;
    const y1 = 24 + from.y * rowHeight;
    const x2 = 24 + to.x * columnWidth;
    const y2 = 24 + to.y * rowHeight;
    const midY = y1 + Math.max(10, Math.abs(y2 - y1) / 2);
    return `<path class="graph-edge" d="M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}" />`;
  }).join('');

  const nodeSvg = graph.nodes.map((node) => {
    const x = 24 + node.x * columnWidth;
    const y = 24 + node.y * rowHeight;
    const revision = revisionByGraphId.get(node.id);
    const meta = revision
      ? [
          revision.displayTimestamp || revision.timestamp,
          revision.committer,
          revision.branchNick,
          revision.tags.map((tag) => `#${tag}`).join(' ')
        ].filter(Boolean).join(' / ')
      : '';
    return '<g class="graph-node" data-revision-id="' + escapeHtml(node.id) + '">' +
      '<circle cx="' + x + '" cy="' + y + '" r="' + radius + '" />' +
      '<text class="graph-label" x="' + labelLaneX + '" y="' + (y - 5) + '">' + escapeHtml(firstLine(node.label)) + '</text>' +
      '<text class="graph-label-meta" x="' + labelLaneX + '" y="' + (y + 11) + '">' + escapeHtml(meta) + '</text>' +
    '</g>';
  }).join('');

  return '<svg viewBox="0 0 ' + width + ' ' + height + '" width="' + width + '" height="' + height + '" role="img" aria-label="Bazaar リビジョングラフ">' +
    edgeSvg +
    nodeSvg +
  '</svg>';
}

function firstLine(value: string): string {
  return value.split(/\r?\n/)[0]?.trim() || '(メッセージなし)';
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
