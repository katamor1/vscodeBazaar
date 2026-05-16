import type { BazaarChange } from '../bazaar/types';

export interface PendingMergeForgetPrompt {
  message: string;
  detail?: string;
}

export function pendingMergeForgetPrompt(change: BazaarChange | undefined, _rootPath: string): PendingMergeForgetPrompt {
  return {
    message: 'Forget Bazaar pending merge state without changing files?',
    detail: change?.kind === 'pendingMerge' ? change.description : undefined
  };
}
