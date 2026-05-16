import { normalizeRevisionSpec } from '../bazaar/revisionSpec';
import type { BazaarRevision, BazaarTag } from '../bazaar/types';
import { revisionSpecForDocument } from './historyTarget';

export function tagRevisionSpec(tag: BazaarTag): string | undefined {
  const name = tag.name.trim();
  return name ? `tag:${name}` : undefined;
}

export function manualRevisionSpec(value: unknown): string | undefined {
  const revisionSpec = normalizeRevisionSpec(value);
  if (!revisionSpec || revisionSpec === '?' || revisionSpec === '-') {
    return undefined;
  }
  return revisionSpec;
}

export function branchTipRevisionSpec(revision: BazaarRevision): string | undefined {
  return revisionSpecForDocument(revision);
}
