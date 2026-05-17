import { describe, expect, it } from 'vitest';
import { BazaarClient, isPullDivergedError } from '../src/bazaar/client';

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
      ['commit', '-m', 'work in progress', '--', 'src/app.ts', 'docs/current spec.md']
    ]);
  });

  it('commits the whole Bazaar tree only when explicitly requested', async () => {
    const calls: string[][] = [];
    const client = new BazaarClient({
      cwd: 'C:/repo',
      cliPath: 'bzr',
      run: async (args) => {
        calls.push([...args]);
        return { stdout: '', stderr: '', exitCode: 0 };
      }
    });

    await expect(client.commit('merge state only', [])).rejects.toThrow('No included files to commit');
    await client.commit('merge state only', [], { wholeTree: true });

    expect(calls).toEqual([
      ['commit', '-m', 'merge state only']
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
      ['add', '--', 'notes draft.txt']
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

    await client.log({ limit: 25, includeMerged: true, path: '--history-file' });
    await client.annotate('-annotate-file');
    await client.branches('..');
    await client.createBranch('main', '../feature');
    await client.switchBranch('../feature', true);
    await client.removeBranch('../old', true);
    await client.createTag('v1', '2', true);
    await client.deleteTag('v0');

    expect(calls).toEqual([
      ['log', '--xml', '--show-ids', '-v', '--limit', '25', '--include-merged', '--', '--history-file'],
      ['annotate', '--all', '--long', '--', '-annotate-file'],
      ['branches', '--recursive', '..'],
      ['nick'],
      ['branch', 'main', '../feature'],
      ['switch', '--force', '../feature'],
      ['remove-branch', '--force', '../old'],
      ['tag', '--force', '-r', '2', 'v1'],
      ['tag', '--delete', 'v0']
    ]);
  });

  it('runs history against an explicit fallback branch target', async () => {
    const calls: string[][] = [];
    const client = new BazaarClient({
      cwd: 'C:/repo/trunk',
      cliPath: 'bzr',
      run: async (args) => {
        calls.push([...args]);
        return { stdout: '<logs></logs>', stderr: '', exitCode: 0 };
      }
    });

    await expect(client.logAt('C:/repo/branch1/src/app.ts', {
      limit: 10,
      includeMerged: true,
      match: 'fix'
    })).resolves.toEqual([]);

    expect(calls).toEqual([
      ['log', '--xml', '--show-ids', '-v', '--limit', '10', '--include-merged', '--match', 'fix', '--', 'C:/repo/branch1/src/app.ts']
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

  it('reports the full Bazaar command and response after each invocation', async () => {
    const traces: Array<{ cwd: string; commandLine: string; result: { stdout: string; stderr: string; exitCode: number } }> = [];
    const client = new BazaarClient({
      cwd: 'C:/repo',
      cliPath: 'C:/Program Files/Bazaar/bzr.exe',
      run: async () => ({
        stdout: 'modified:\n  src/app.ts\n',
        stderr: 'warning: stale lock ignored\n',
        exitCode: 0
      }),
      onCommandComplete: (trace) => traces.push(trace)
    });

    await client.status();

    expect(traces).toEqual([
      {
        cwd: 'C:/repo',
        commandLine: '"C:/Program Files/Bazaar/bzr.exe" status',
        result: {
          stdout: 'modified:\n  src/app.ts\n',
          stderr: 'warning: stale lock ignored\n',
          exitCode: 0
        }
      }
    ]);
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

  it('terminates Bazaar cat options before passing the revision path', async () => {
    const calls: string[][] = [];
    const client = new BazaarClient({
      cwd: 'C:/repo',
      cliPath: 'bzr',
      run: async (args) => {
        calls.push([...args]);
        return { stdout: 'content', stderr: '', exitCode: 0 };
      }
    });

    await expect(client.catAtRevision('7', '--help')).resolves.toBe('content');

    expect(calls).toEqual([
      ['cat', '-r', '7', '--', '--help']
    ]);
  });

  it('terminates Bazaar options before passing working-tree paths', async () => {
    const calls: string[][] = [];
    const client = new BazaarClient({
      cwd: 'C:/repo',
      cliPath: 'bzr',
      run: async (args) => {
        calls.push([...args]);
        return { stdout: '', stderr: '', exitCode: 0 };
      }
    });

    await client.prepareIncludedForCommit([{ path: '--new-file', kind: 'unknown' }]);
    await client.commit('message', ['--committed-file']);
    await client.revert(['--revert-file']);
    await client.resolve('--resolved-file');
    await client.resolveConflict('--conflict-file', 'take-other');
    await client.catBasis('--basis-file');
    await client.diff('--diff-file');
    await client.diffChange('7', '--changed-file');
    await client.logRevision('7', '--logged-file');
    await client.annotate('--annotated-file');
    await client.shelve(['--shelved-file'], 'save it');

    expect(calls).toEqual([
      ['add', '--', '--new-file'],
      ['commit', '-m', 'message', '--', '--committed-file'],
      ['revert', '--', '--revert-file'],
      ['resolve', '--', '--resolved-file'],
      ['resolve', '--take-other', '--', '--conflict-file'],
      ['cat', '-r', '-1', '--', '--basis-file'],
      ['diff', '--', '--diff-file'],
      ['diff', '-c', '7', '--', '--changed-file'],
      ['log', '--xml', '--show-ids', '-v', '-r', '7', '--', '--logged-file'],
      ['annotate', '--all', '--long', '--', '--annotated-file'],
      ['shelve', '-m', 'save it', '--', '--shelved-file']
    ]);
  });

  it('pushes to the parent branch when Bazaar has no remembered push location', async () => {
    const calls: string[][] = [];
    const client = new BazaarClient({
      cwd: 'C:/repo/feature',
      cliPath: 'bzr',
      run: async (args) => {
        calls.push([...args]);
        if (args.length === 1 && args[0] === 'push') {
          return {
            stdout: '',
            stderr: "bzr: ERROR: No push location known or specified. To push to the parent branch (at C:/repo/trunk/), use 'bzr push :parent'.",
            exitCode: 3
          };
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      }
    });

    await expect(client.push()).resolves.toBeUndefined();
    expect(calls).toEqual([
      ['push'],
      ['push', ':parent']
    ]);
  });

  it('detects diverged pull errors for the extension merge workflow', async () => {
    const calls: string[][] = [];
    const client = new BazaarClient({
      cwd: 'C:/repo/branch2',
      cliPath: 'bzr',
      run: async (args) => {
        calls.push([...args]);
        return {
          stdout: 'デフォルトの親ブランチを使用します。: C:/repo/branch1/',
          stderr: 'bzr: ERROR: These branches have diverged. Use the missing command to see how.\nUse the merge command to reconcile them.',
          exitCode: 3
        };
      }
    });

    let caught: unknown;
    try {
      await client.pull();
    } catch (error) {
      caught = error;
    }

    expect(isPullDivergedError(caught)).toBe(true);
    expect(calls).toEqual([
      ['pull']
    ]);
  });

  it('supports parent merge and missing output after diverged pull', async () => {
    const calls: string[][] = [];
    const client = new BazaarClient({
      cwd: 'C:/repo/branch2',
      cliPath: 'bzr',
      run: async (args) => {
        calls.push([...args]);
        if (args[0] === 'merge') {
          return { stdout: 'Text conflict in app.txt\n1 conflicts encountered.\n', stderr: '', exitCode: 1 };
        }
        return { stdout: 'You have 1 extra revision(s):\n', stderr: '', exitCode: 1 };
      }
    });

    await expect(client.mergeParent()).resolves.toContain('Text conflict');
    await expect(client.missing()).resolves.toContain('extra revision');
    expect(calls).toEqual([
      ['merge'],
      ['missing']
    ]);
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

  it('returns an empty status when the versioned fallback also hits Bazaar recursion', async () => {
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

    await expect(client.status()).resolves.toEqual([]);
    expect(calls).toEqual([
      ['status'],
      ['status', '--versioned', '--no-classify']
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

  it('keeps the current branch visible when recursive branch discovery hits Bazaar recursion', async () => {
    const recursion = 'bzr: ERROR: exceptions.RuntimeError: maximum recursion depth exceeded while calling a Python object';
    const calls: string[][] = [];
    const client = new BazaarClient({
      cwd: 'C:/repo/branch1',
      cliPath: 'bzr',
      run: async (args) => {
        calls.push([...args]);
        if (args[0] === 'branches') {
          return { stdout: '', stderr: recursion, exitCode: 3 };
        }
        return { stdout: 'branch1\n', stderr: '', exitCode: 0 };
      }
    });

    await expect(client.branches('C:/repo')).resolves.toEqual([
      { name: 'branch1', path: '.', current: true }
    ]);
    expect(calls).toEqual([
      ['branches', '--recursive', 'C:/repo'],
      ['nick']
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
