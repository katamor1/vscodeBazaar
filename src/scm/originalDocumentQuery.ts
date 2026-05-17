import { normalizeRelativeDocumentPath } from './revisionDocumentQuery';

export interface OriginalDocumentQuery {
  path: string;
}

export function encodeOriginalDocumentQuery(query: OriginalDocumentQuery): string {
  return encodeURIComponent(JSON.stringify(query));
}

export function decodeOriginalDocumentQuery(encodedQuery: string): OriginalDocumentQuery | undefined {
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
  return relativePath ? { path: relativePath } : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
