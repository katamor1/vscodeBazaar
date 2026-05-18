import { revisionGraphId } from '../bazaar/revisionSpec';
import type { BazaarRevision } from '../bazaar/types';
import { formatRevisionTimestamp } from './revisionTime';

export interface HistoryEditorRevision {
  graphId: string;
  revno: string;
  revisionId: string;
  committer: string;
  branchNick: string;
  timestamp: string;
  displayTimestamp: string;
  message: string;
  summary: string;
  tags: readonly string[];
  parentIds: readonly string[];
  changedPaths: readonly string[];
}

export interface HistoryEditorPayload {
  revisions: HistoryEditorRevision[];
  limit: number;
  pathFilter?: string;
  canLoadMore: boolean;
  loading: boolean;
}

export interface HistoryEditorPayloadOptions {
  limit: number;
  pathFilter?: string;
  loading: boolean;
}

export function createHistoryEditorPayload(
  revisions: readonly BazaarRevision[],
  options: HistoryEditorPayloadOptions
): HistoryEditorPayload {
  return {
    revisions: revisions.flatMap((revision) => {
      const graphId = revisionGraphId(revision);
      return graphId
        ? [{
            graphId,
            revno: revision.revno,
            revisionId: revision.revisionId,
            committer: revision.committer,
            branchNick: revision.branchNick,
            timestamp: revision.timestamp,
            displayTimestamp: formatRevisionTimestamp(revision.timestamp),
            message: revision.message,
            summary: firstLine(revision.message),
            tags: revision.tags,
            parentIds: revision.parentIds,
            changedPaths: revision.changedPaths ?? []
          }]
        : [];
    }),
    limit: options.limit,
    pathFilter: options.pathFilter,
    canLoadMore: revisions.length >= options.limit,
    loading: options.loading
  };
}

function firstLine(message: string): string {
  return message.split(/\r?\n/)[0] || '(メッセージなし)';
}
