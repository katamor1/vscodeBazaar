import type { BazaarRevision } from '../bazaar/types';
import { normalizeRevisionSpec } from '../bazaar/revisionSpec';

export function resolveRevisionCommandTarget(target: unknown): BazaarRevision | undefined {
  const candidate = isRevisionNode(target) ? target.revision : target;
  return isBazaarRevision(candidate) ? candidate : undefined;
}

export function revisionSpecForCommand(revision: BazaarRevision): string | undefined {
  const revno = normalizeRevisionSpec(revision.revno);
  if (revno) {
    return revno;
  }

  const revisionId = normalizeRevisionSpec(revision.revisionId);
  return revisionId ? `revid:${revisionId}` : undefined;
}

export function revisionSpecForDocument(revision: BazaarRevision): string | undefined {
  const revisionId = normalizeRevisionSpec(revision.revisionId);
  if (revisionId) {
    return `revid:${revisionId}`;
  }

  return normalizeRevisionSpec(revision.revno);
}

export function revisionDisplayLabel(revision: BazaarRevision): string {
  return normalizeRevisionSpec(revision.revno) ?? normalizeRevisionSpec(revision.revisionId) ?? '(unknown revision)';
}

function isRevisionNode(value: unknown): value is { type: 'revision'; revision: unknown } {
  return isObject(value) && value.type === 'revision' && 'revision' in value;
}

function isBazaarRevision(value: unknown): value is BazaarRevision {
  if (!isObject(value)) {
    return false;
  }

  const hasRevisionIdentity =
    normalizeRevisionSpec(value.revno) !== undefined || normalizeRevisionSpec(value.revisionId) !== undefined;
  return (
    Array.isArray(value.parentIds) &&
    Array.isArray(value.tags) &&
    typeof value.committer === 'string' &&
    typeof value.branchNick === 'string' &&
    typeof value.timestamp === 'string' &&
    typeof value.message === 'string' &&
    typeof value.depth === 'number' &&
    hasRevisionIdentity
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
