import type { BazaarRevision } from './types';

export function normalizeRevisionSpec(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  const lowered = normalized.toLowerCase();
  if (lowered === 'undefined' || lowered === 'null') {
    return undefined;
  }

  return normalized;
}

export function requireRevisionSpec(value: unknown): string {
  const normalized = normalizeRevisionSpec(value);
  if (!normalized) {
    throw new Error('Bazaar revision is required before running this command.');
  }
  return normalized;
}

export function revisionGraphId(revision: BazaarRevision): string | undefined {
  return normalizeRevisionSpec(revision.revisionId) ?? normalizeRevisionSpec(revision.revno);
}
