import { normalizeRevisionSpec } from '../bazaar/revisionSpec';

export interface BlameRevisionLike {
  revno: string;
}

export function revisionSpecForBlameAnnotation(annotation?: BlameRevisionLike): string | undefined {
  const revisionSpec = normalizeRevisionSpec(annotation?.revno);
  if (!revisionSpec) {
    return undefined;
  }

  if (revisionSpec === '?' || revisionSpec === '-') {
    return undefined;
  }

  return revisionSpec;
}
