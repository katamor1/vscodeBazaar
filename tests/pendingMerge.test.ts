import { describe, expect, it } from 'vitest';
import { pendingMergeForgetPrompt } from '../src/scm/pendingMerge';
import type { BazaarChange } from '../src/bazaar/types';

describe('pendingMergeForgetPrompt', () => {
  it('targets the pending merge state instead of the checkout folder path', () => {
    const change: BazaarChange = {
      path: 'Pending merge',
      kind: 'pendingMerge',
      description: 'pending merge tips: (use -v to see all merge revisions)\n  branch1 merge'
    };

    expect(pendingMergeForgetPrompt(change, 'C:/repo/trunk')).toEqual({
      message: 'Forget Bazaar pending merge state without changing files?',
      detail: 'pending merge tips: (use -v to see all merge revisions)\n  branch1 merge'
    });
  });
});
