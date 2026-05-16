import type { BazaarChange } from '../bazaar/types';

export interface CommandLike<TUri> {
  command: string;
  title: string;
  arguments: [] | TUri[] | [TUri, TUri, string];
}

export function createResourceOpenCommand<TUri>(
  change: BazaarChange,
  resourceUri: TUri,
  originalUri: TUri
): CommandLike<TUri> {
  if (change.kind === 'pendingMerge') {
    return {
      command: 'bazaar.merge.forgetPending',
      title: 'Bazaar の Pending Merge 状態をクリア',
      arguments: []
    };
  }

  if (change.kind === 'unknown') {
    return {
      command: 'vscode.open',
      title: 'Bazaar ファイルを開く',
      arguments: [resourceUri]
    };
  }

  return {
    command: 'vscode.diff',
    title: 'Bazaar 変更を開く',
    arguments: [originalUri, resourceUri, `${change.path} (Bazaar)`]
  };
}
