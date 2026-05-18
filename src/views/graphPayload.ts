import { revisionGraphId } from '../bazaar/revisionSpec';
import type { BazaarRevision, RevisionGraph } from '../bazaar/types';
import { formatRevisionTimestamp } from './revisionTime';

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
}

export function createGraphPayload(graph: RevisionGraph, revisions: BazaarRevision[], limit: number): GraphPayload {
  return {
    graph,
    revisions: revisions.flatMap((revision) => {
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
    }),
    limit,
    canLoadMore: revisions.length >= limit
  };
}
