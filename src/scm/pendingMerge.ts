import type { BazaarChange } from '../bazaar/types';

export interface PendingMergeForgetPrompt {
  message: string;
  detail?: string;
}

export function pendingMergeForgetPrompt(change: BazaarChange | undefined, _rootPath: string): PendingMergeForgetPrompt {
  return {
    message: 'ファイル内容を変更せず、Bazaar の pending merge 状態をクリアしますか?',
    detail: change?.kind === 'pendingMerge' ? change.description : undefined
  };
}
