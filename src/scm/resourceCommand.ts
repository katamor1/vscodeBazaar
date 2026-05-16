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
      title: 'Forget Bazaar Pending Merge State',
      arguments: []
    };
  }

  if (change.kind === 'unknown') {
    return {
      command: 'vscode.open',
      title: 'Open Bazaar File',
      arguments: [resourceUri]
    };
  }

  return {
    command: 'vscode.diff',
    title: 'Open Bazaar Changes',
    arguments: [originalUri, resourceUri, `${change.path} (Bazaar)`]
  };
}
