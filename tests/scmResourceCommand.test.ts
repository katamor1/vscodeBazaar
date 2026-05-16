import { describe, expect, it } from 'vitest';
import { createResourceOpenCommand } from '../src/scm/resourceCommand';
import type { BazaarChange } from '../src/bazaar/types';

describe('createResourceOpenCommand', () => {
  it('opens tracked changes through vscode.diff without self-referencing resource state', () => {
    const change: BazaarChange = { path: 'src/app.ts', kind: 'modified' };
    const resourceUri = { scheme: 'file', path: '/repo/src/app.ts' };
    const originalUri = { scheme: 'bazaar-original', path: '/src/app.ts' };

    expect(createResourceOpenCommand(change, resourceUri, originalUri)).toEqual({
      command: 'vscode.diff',
      title: 'Open Bazaar Changes',
      arguments: [originalUri, resourceUri, 'src/app.ts (Bazaar)']
    });
  });

  it('opens unknown files directly because there is no Bazaar basis revision', () => {
    const change: BazaarChange = { path: 'scratch.txt', kind: 'unknown' };
    const resourceUri = { scheme: 'file', path: '/repo/scratch.txt' };
    const originalUri = { scheme: 'bazaar-original', path: '/scratch.txt' };

    expect(createResourceOpenCommand(change, resourceUri, originalUri)).toEqual({
      command: 'vscode.open',
      title: 'Open Bazaar File',
      arguments: [resourceUri]
    });
  });

  it('routes pending merge pseudo changes to the forget-merge command', () => {
    const change: BazaarChange = { path: 'Pending merge', kind: 'pendingMerge' };
    const resourceUri = { scheme: 'file', path: '/repo/Pending merge' };
    const originalUri = { scheme: 'bazaar-original', path: '/Pending merge' };

    expect(createResourceOpenCommand(change, resourceUri, originalUri)).toEqual({
      command: 'bazaar.merge.forgetPending',
      title: 'Forget Bazaar Pending Merge State',
      arguments: []
    });
  });
});
