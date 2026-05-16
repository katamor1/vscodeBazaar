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
      message: 'ファイル内容を変更せず、Bazaar の pending merge 状態をクリアしますか?',
      detail: 'pending merge tips: (use -v to see all merge revisions)\n  branch1 merge'
    });
  });
});
