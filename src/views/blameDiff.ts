import { normalizeRevisionSpec } from '../bazaar/revisionSpec';
import type { BazaarRevision } from '../bazaar/types';
import { manualRevisionSpec } from './blamePicker';
import { revisionDisplayLabel, revisionSpecForDocument } from './historyTarget';

export type BlameDiffSide =
  | { kind: 'revision'; revision: string }
  | { kind: 'empty'; revision: string }
  | { kind: 'working' };

export type BlameDiffMode = 'previous' | 'working' | 'comparison';

export interface BlameDiffEditorTarget {
  left: BlameDiffSide;
  right: BlameDiffSide;
  label: string;
  mode: BlameDiffMode;
}

export function createPreviousRevisionDiffTarget(
  revision: BazaarRevision,
  fallbackRevisionSpec: string
): BlameDiffEditorTarget | undefined {
  const rightRevision = revisionSpecForDocument(revision) ?? normalizeRevisionSpec(fallbackRevisionSpec);
  if (!rightRevision) {
    return undefined;
  }

  const label = revisionDisplayLabel(revision);
  const parentId = normalizeRevisionSpec(revision.parentIds[0]);
  return {
    left: parentId
      ? { kind: 'revision', revision: `revid:${parentId}` }
      : { kind: 'empty', revision: `before:${label}` },
    right: { kind: 'revision', revision: rightRevision },
    label,
    mode: 'previous'
  };
}

export function createWorkingFileDiffTarget(
  revision: BazaarRevision,
  fallbackRevisionSpec: string
): BlameDiffEditorTarget | undefined {
  const leftRevision = revisionSpecForDocument(revision) ?? normalizeRevisionSpec(fallbackRevisionSpec);
  if (!leftRevision) {
    return undefined;
  }

  return {
    left: { kind: 'revision', revision: leftRevision },
    right: { kind: 'working' },
    label: revisionDisplayLabel(revision),
    mode: 'working'
  };
}

export function createComparisonToWorkingFileTarget(
  revisionSpec: string,
  label = revisionSpec
): BlameDiffEditorTarget | undefined {
  const normalized = manualRevisionSpec(revisionSpec);
  if (!normalized) {
    return undefined;
  }

  return {
    left: { kind: 'revision', revision: normalized },
    right: { kind: 'working' },
    label,
    mode: 'comparison'
  };
}
