import { describe, expect, it } from 'vitest';
import { BazaarClient } from '../src/bazaar/client';

describe('BazaarClient V0.2 commands', () => {
  it('reads arbitrary file revisions and text conflicts', async () => {
    const calls: string[][] = [];
    const client = new BazaarClient({
      cwd: 'C:/repo',
      cliPath: 'bzr',
      run: async (args) => {
        calls.push([...args]);
        if (args[0] === 'cat') {
          return { stdout: 'contents', stderr: '', exitCode: 0 };
        }
        return { stdout: 'src/app.ts\n', stderr: '', exitCode: 0 };
      }
    });

    await expect(client.catAtRevision('revid:abc', 'src/app.ts')).resolves.toBe('contents');
    await expect(client.conflictsText()).resolves.toEqual(['src/app.ts']);

    expect(calls).toEqual([
      ['cat', '-r', 'revid:abc', 'src/app.ts'],
      ['conflicts', '--text']
    ]);
  });

  it('runs shelve and unshelve actions with explicit safe arguments', async () => {
    const calls: string[][] = [];
    const client = new BazaarClient({
      cwd: 'C:/repo',
      cliPath: 'bzr',
      run: async (args) => {
        calls.push([...args]);
        return { stdout: '  1: work shelf\n', stderr: '', exitCode: args[1] === '--list' ? 1 : 0 };
      }
    });

    await client.shelves();
    await client.shelve(['src/app.ts'], 'part one');
    await client.shelveAll('all work');
    await client.unshelvePreview('1');
    await client.unshelveApply('1');
    await client.unshelveKeep('1');
    await client.unshelveDelete('1');

    expect(calls).toEqual([
      ['shelve', '--list'],
      ['shelve', '-m', 'part one', 'src/app.ts'],
      ['shelve', '--all', '-m', 'all work'],
      ['unshelve', '1', '--preview'],
      ['unshelve', '1', '--apply'],
      ['unshelve', '1', '--keep'],
      ['unshelve', '1', '--delete-only']
    ]);
  });

  it('runs conflict, clean-tree, uncommit, and lock commands through preview-first APIs', async () => {
    const calls: string[][] = [];
    const client = new BazaarClient({
      cwd: 'C:/repo',
      cliPath: 'bzr',
      run: async (args) => {
        calls.push([...args]);
        return { stdout: 'deleting paths:\n  scratch.txt\n', stderr: '', exitCode: 0 };
      }
    });

    await client.resolveConflict('src/app.ts', 'take-this');
    await client.resolveAll();
    await client.revertAll();
    await client.cleanTreeDryRun(['unknown', 'ignored']);
    await client.cleanTreeRun(['unknown']);
    await client.uncommitDryRun('3');
    await client.uncommitRun('3');
    await client.breakLock('.');
    await client.checkTree();

    expect(calls).toEqual([
      ['resolve', '--take-this', 'src/app.ts'],
      ['resolve', '--all'],
      ['revert'],
      ['clean-tree', '--dry-run', '--unknown'],
      ['clean-tree', '--dry-run', '--ignored'],
      ['clean-tree', '--force', '--unknown'],
      ['uncommit', '--dry-run', '--force', '--verbose', '-r', '3'],
      ['uncommit', '--force', '-r', '3'],
      ['break-lock', '--force', '.'],
      ['check']
    ]);
  });
});
