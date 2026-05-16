import { describe, expect, it } from 'vitest';
import {
  branchTipRevisionSpec,
  manualRevisionSpec,
  tagRevisionSpec
} from '../src/views/blamePicker';
import type { BazaarRevision, BazaarTag } from '../src/bazaar/types';

const revision: BazaarRevision = {
  revno: '9',
  revisionId: 'rev-9',
  parentIds: [],
  tags: [],
  committer: 'Alice',
  branchNick: 'main',
  timestamp: 'today',
  message: 'tip',
  depth: 0
};

describe('blame picker helpers', () => {
  it('turns tags into Bazaar tag revision specs', () => {
    const tag: BazaarTag = { name: 'release-1', revision: '9' };
    expect(tagRevisionSpec(tag)).toBe('tag:release-1');
  });

  it('rejects empty tag names', () => {
    expect(tagRevisionSpec({ name: ' ', revision: '9' })).toBeUndefined();
  });

  it('rejects whitespace-only tag names including tabs and spaces', () => {
    expect(tagRevisionSpec({ name: ' \t ', revision: '9' })).toBeUndefined();
  });

  it('normalizes manual revision specs and rejects placeholders', () => {
    expect(manualRevisionSpec(' revid:abc ')).toBe('revid:abc');
    expect(manualRevisionSpec('')).toBeUndefined();
    expect(manualRevisionSpec('undefined')).toBeUndefined();
    expect(manualRevisionSpec('null')).toBeUndefined();
    expect(manualRevisionSpec('?')).toBeUndefined();
    expect(manualRevisionSpec('-')).toBeUndefined();
  });

  it('uses revision id first for branch tip revisions', () => {
    expect(branchTipRevisionSpec(revision)).toBe('revid:rev-9');
    expect(branchTipRevisionSpec({ ...revision, revisionId: '' })).toBe('9');
    expect(branchTipRevisionSpec({ ...revision, revisionId: '', revno: '' })).toBeUndefined();
  });

  it('does not create a branch tip spec from a placeholder revision id when revno is empty', () => {
    expect(branchTipRevisionSpec({ ...revision, revisionId: 'undefined', revno: '' })).toBeUndefined();
  });
});
