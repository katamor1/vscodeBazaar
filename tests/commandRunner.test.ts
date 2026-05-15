import { describe, expect, it } from 'vitest';
import { BazaarClient } from '../src/bazaar/client';

describe('BazaarClient', () => {
  it('commits exactly the included file list with a message', async () => {
    const calls: string[][] = [];
    const client = new BazaarClient({
      cwd: 'C:/repo',
      cliPath: 'bzr',
      run: async (args) => {
        calls.push(args);
        return { stdout: '', stderr: '', exitCode: 0 };
      }
    });

    await client.commit('work in progress', ['src/app.ts', 'docs/current spec.md']);

    expect(calls).toEqual([
      ['commit', '-m', 'work in progress', 'src/app.ts', 'docs/current spec.md']
    ]);
  });

  it('adds unknown files before committing them', async () => {
    const calls: string[][] = [];
    const client = new BazaarClient({
      cwd: 'C:/repo',
      cliPath: 'bzr',
      run: async (args) => {
        calls.push(args);
        return { stdout: '', stderr: '', exitCode: 0 };
      }
    });

    await client.prepareIncludedForCommit([{ path: 'notes draft.txt', kind: 'unknown' }]);

    expect(calls).toEqual([
      ['add', 'notes draft.txt']
    ]);
  });

  it('runs history, branch, tag, and annotate commands with explicit arguments', async () => {
    const calls: string[][] = [];
    const client = new BazaarClient({
      cwd: 'C:/repo',
      cliPath: 'bzr',
      run: async (args) => {
        calls.push([...args]);
        return { stdout: '', stderr: '', exitCode: 0 };
      }
    });

    await client.log({ limit: 25, includeMerged: true, path: 'src/app.ts' });
    await client.annotate('src/app.ts');
    await client.branches('..');
    await client.createBranch('main', '../feature');
    await client.switchBranch('../feature', true);
    await client.removeBranch('../old', true);
    await client.createTag('v1', '2', true);
    await client.deleteTag('v0');

    expect(calls).toEqual([
      ['log', '--xml', '--show-ids', '-v', '--limit', '25', '--include-merged', 'src/app.ts'],
      ['annotate', '--all', '--long', 'src/app.ts'],
      ['branches', '--recursive', '..'],
      ['nick'],
      ['branch', 'main', '../feature'],
      ['switch', '--force', '../feature'],
      ['remove-branch', '--force', '../old'],
      ['tag', '--force', '-r', '2', 'v1'],
      ['tag', '--delete', 'v0']
    ]);
  });

  it('throws with command output when Bazaar exits unsuccessfully', async () => {
    const client = new BazaarClient({
      cwd: 'C:/repo',
      cliPath: 'bzr',
      run: async () => ({ stdout: 'partial', stderr: 'failed badly', exitCode: 3 })
    });

    await expect(client.status()).rejects.toThrow('failed badly');
  });

  it('rejects invalid revision specs before invoking Bazaar', async () => {
    const calls: string[][] = [];
    const client = new BazaarClient({
      cwd: 'C:/repo',
      cliPath: 'bzr',
      run: async (args) => {
        calls.push([...args]);
        return { stdout: '', stderr: '', exitCode: 0 };
      }
    });

    await expect(client.diffChange('')).rejects.toThrow('Bazaar revision is required');
    await expect(client.diffChange('undefined')).rejects.toThrow('Bazaar revision is required');
    await expect(client.catAtRevision('null', 'src/app.ts')).rejects.toThrow('Bazaar revision is required');
    await expect(client.logRevision('   ')).rejects.toThrow('Bazaar revision is required');

    expect(calls).toEqual([]);
  });

  it('falls back to versioned status and unknown ls when full status hits Bazaar recursion', async () => {
    const calls: string[][] = [];
    const client = new BazaarClient({
      cwd: 'C:/repo',
      cliPath: 'bzr',
      run: async (args) => {
        calls.push([...args]);
        if (args[0] === 'status' && args.length === 1) {
          return {
            stdout: '',
            stderr: 'bzr: ERROR: exceptions.RuntimeError: maximum recursion depth exceeded while calling a Python object',
            exitCode: 3
          };
        }
        if (args[0] === 'status') {
          return { stdout: 'modified:\n  tracked.txt\n', stderr: '', exitCode: 0 };
        }
        return { stdout: 'unknown_dir/\nunknown.txt\n', stderr: '', exitCode: 0 };
      }
    });

    await expect(client.status()).resolves.toEqual([
      { path: 'tracked.txt', kind: 'modified' },
      { path: 'unknown_dir', kind: 'unknown' },
      { path: 'unknown.txt', kind: 'unknown' }
    ]);
    expect(calls).toEqual([
      ['status'],
      ['status', '--versioned', '--no-classify'],
      ['ls', '--unknown', '--from-root']
    ]);
  });

  it('returns empty read models when Bazaar metadata commands hit recursion', async () => {
    const recursion = 'bzr: ERROR: exceptions.RuntimeError: maximum recursion depth exceeded while calling a Python object';
    const calls: string[][] = [];
    const client = new BazaarClient({
      cwd: 'C:/repo',
      cliPath: 'bzr',
      run: async (args) => {
        calls.push([...args]);
        return { stdout: '', stderr: recursion, exitCode: 3 };
      }
    });

    await expect(client.conflicts()).resolves.toEqual([]);
    await expect(client.log({ limit: 200, includeMerged: true })).resolves.toEqual([]);
    await expect(client.info()).resolves.toEqual({});
    await expect(client.tags()).resolves.toEqual([]);
    await expect(client.shelves()).resolves.toEqual([]);
    await expect(client.conflictsText()).resolves.toEqual([]);

    expect(calls).toEqual([
      ['conflicts'],
      ['log', '--xml', '--show-ids', '-v', '--limit', '200', '--include-merged'],
      ['info'],
      ['tags'],
      ['shelve', '--list'],
      ['conflicts', '--text']
    ]);
  });

  it('serializes Bazaar commands so dirstate-locking operations cannot overlap', async () => {
    let active = 0;
    let overlapped = false;
    const releases: Array<() => void> = [];
    let startedCount = 0;
    const firstStarted = new Promise<void>((resolve) => {
      const client = new BazaarClient({
        cwd: 'C:/repo',
        cliPath: 'bzr',
        run: async () => {
          active++;
          overlapped ||= active > 1;
          startedCount++;
          if (startedCount === 1) {
            resolve();
          }
          await new Promise<void>((release) => {
            releases.push(release);
          });
          active--;
          return { stdout: '', stderr: '', exitCode: 0 };
        }
      });

      void Promise.all([client.status(), client.conflicts()]);
    });

    await firstStarted;
    expect(overlapped).toBe(false);
    releases.shift()?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    releases.shift()?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(overlapped).toBe(false);
  });
});
