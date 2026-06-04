import { revisionGraphId } from '../bazaar/revisionSpec';
import type { BazaarRevision, RevisionGraph } from '../bazaar/types';
import { canLoadMoreRevisions } from './loadMoreSentinel';
import { formatRevisionTimestamp } from './revisionTime';
import { renderRevisionGraphSvg } from './revisionGraphRenderer';

export interface GraphPayloadRevision {
  graphId: string;
  revno: string;
  committer: string;
  timestamp: string;
  displayTimestamp: string;
  branchNick: string;
  tags: string[];
  parents: string[];
  message: string;
  changedPaths: string[];
}

export interface GraphPayload {
  graph: RevisionGraph;
  revisions: GraphPayloadRevision[];
  limit: number;
  canLoadMore: boolean;
  loading: boolean;
  graphHtml: string;
}

export interface GraphPayloadOptions {
  limit: number;
  loading: boolean;
}

export function createGraphPayload(graph: RevisionGraph, revisions: BazaarRevision[], options: GraphPayloadOptions): GraphPayload {
  const renderedRevisions = revisions.flatMap((revision) => {
    const graphId = revisionGraphId(revision);
    return graphId
      ? [{
          graphId,
          revno: revision.revno,
          committer: revision.committer,
          timestamp: revision.timestamp,
          displayTimestamp: formatRevisionTimestamp(revision.timestamp),
          branchNick: revision.branchNick,
          tags: revision.tags,
          parents: revision.parentIds,
          message: revision.message,
          changedPaths: revision.changedPaths ?? []
        }]
      : [];
  });
  return {
    graph,
    revisions: renderedRevisions,
    limit: options.limit,
    canLoadMore: canLoadMoreRevisions(renderedRevisions),
    loading: options.loading,
    graphHtml: renderRevisionGraphSvg(graph, renderedRevisions)
  };
}
