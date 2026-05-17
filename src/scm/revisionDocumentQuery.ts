import * as path from 'node:path';
import { normalizeRevisionSpec } from '../bazaar/revisionSpec';

export interface RevisionDocumentQuery {
  path: string;
  revision: string;
  empty?: boolean;
}

export function encodeRevisionDocumentQuery(query: RevisionDocumentQuery): string {
  return encodeURIComponent(JSON.stringify(query));
}

export function decodeRevisionDocumentQuery(encodedQuery: string): RevisionDocumentQuery | undefined {
  if (!encodedQuery) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(encodedQuery));
  } catch {
    return undefined;
  }

  if (!isRecord(parsed)) {
    return undefined;
  }

  const relativePath = normalizeRelativeDocumentPath(parsed.path);
  const revision = normalizeDocumentRevision(parsed.revision);
  if (!relativePath || !revision) {
    return undefined;
  }

  return {
    path: relativePath,
    revision,
    empty: parsed.empty === true
  };
}

export function normalizeRelativeDocumentPath(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().replace(/\\/g, '/');
  if (!normalized || path.posix.isAbsolute(normalized) || path.win32.isAbsolute(normalized)) {
    return undefined;
  }
  const parts = normalized.split('/');
  if (parts.some((part) => part === '..')) {
    return undefined;
  }

  return normalized;
}

function normalizeDocumentRevision(value: unknown): string | undefined {
  const revision = normalizeRevisionSpec(value);
  if (!revision || revision === '?' || revision === '-') {
    return undefined;
  }
  return revision;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
