import type { BazaarRevision } from '../bazaar/types';
import { normalizeRevisionSpec, revisionGraphId } from '../bazaar/revisionSpec';
import { resolveRevisionCommandTarget } from './historyTarget';

export interface GraphMessage {
  command?: string;
  revisionId?: string;
  path?: string;
}

export type GraphRevisionCommand =
  | { command: 'refresh' }
  | { command: 'showCommit'; revision: BazaarRevision }
  | { command: 'showDiff'; revision: BazaarRevision; path?: string };

export function resolveGraphRevisionMessage(
  revisions: readonly BazaarRevision[],
  message: GraphMessage
): GraphRevisionCommand | undefined {
  if (message.command === 'refresh') {
    return { command: 'refresh' };
  }
  if (message.command !== 'showCommit' && message.command !== 'showDiff') {
    return undefined;
  }

  const requestedId = normalizeRevisionSpec(message.revisionId);
  if (!requestedId) {
    return undefined;
  }

  const revision = resolveRevisionCommandTarget(
    revisions.find((candidate) => revisionGraphId(candidate) === requestedId)
  );
  if (!revision) {
    return undefined;
  }

  return message.command === 'showCommit'
    ? { command: 'showCommit', revision }
    : { command: 'showDiff', revision, path: message.path };
}
