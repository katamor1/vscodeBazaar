import type { BazaarRevision } from '../bazaar/types';
import { normalizeRevisionSpec } from '../bazaar/revisionSpec';
import {
  revisionDisplayLabel,
  revisionSpecForCommand,
  revisionSpecForDocument
} from './historyTarget';

export type HistoryCommitDiffPlan =
  | {
      kind: 'fileDiff';
      title: string;
      changedPath: string;
      leftRevision: string;
      leftEmpty?: true;
      rightRevision: string;
    }
  | {
      kind: 'patchDocument';
      title: string;
      revisionSpec: string;
      changedPath?: string;
    };

export function createHistoryCommitDiffPlan(
  revision: BazaarRevision,
  changedPath: string | undefined
): HistoryCommitDiffPlan | undefined {
  const normalizedPath = normalizeChangedPath(changedPath);
  if (!normalizedPath) {
    const revisionSpec = revisionSpecForCommand(revision);
    if (!revisionSpec) {
      return undefined;
    }
    return {
      kind: 'patchDocument',
      title: `Bazaar commit diff ${revisionDisplayLabel(revision)}`,
      revisionSpec
    };
  }

  const rightRevision = revisionSpecForDocument(revision);
  if (!rightRevision) {
    return undefined;
  }

  const revisionLabel = revisionDisplayLabel(revision);
  const parentId = normalizeRevisionSpec(revision.parentIds[0]);
  if (!parentId) {
    return {
      kind: 'fileDiff',
      title: `${normalizedPath} (${revisionLabel})`,
      changedPath: normalizedPath,
      leftRevision: `before:${revisionLabel}`,
      leftEmpty: true,
      rightRevision
    };
  }

  return {
    kind: 'fileDiff',
    title: `${normalizedPath} (${revisionLabel})`,
    changedPath: normalizedPath,
    leftRevision: `revid:${parentId}`,
    rightRevision
  };
}

function normalizeChangedPath(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().replace(/\\/g, '/');
  return normalized || undefined;
}
