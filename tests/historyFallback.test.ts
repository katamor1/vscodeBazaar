import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { BazaarRevision } from '../src/bazaar/types';
import { loadBazaarRevisionsWithFallback } from '../src/views/historyFallback';

const tmpRoots: string[] = [];

describe('loadBazaarRevisionsWithFallback', () => {
  afterEach(async () => {
    for (const root of tmpRoots.splice(0)) {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('uses the degraded branch fallback source when direct history is empty', async () => {
    const root = await makeTmpRoot();
    const trunk = path.join(root, 'trunk');
    const branch1 = path.join(root, 'branch1');
    await makeBranch(trunk, { referenceLocation: pathToFileURL(trunk).href });
    await makeBranch(branch1, { parentLocation: '../trunk' });

    const calls: string[] = [];
    const revision = fakeRevision('10');
    const output: string[] = [];

    const revisions = await loadBazaarRevisionsWithFallback(trunk, {
      log: async () => {
        calls.push('log');
        return [];
      },
      logAt: async (target, options) => {
        calls.push(`logAt:${normalize(target)}:${options.limit}`);
        return [revision];
      }
    }, {
      limit: 25,
      includeMerged: true
    }, {
      appendLine: (line) => output.push(line)
    });

    expect(revisions).toEqual([revision]);
    expect(calls).toEqual([
      'log',
      `logAt:${normalize(branch1)}:25`
    ]);
    expect(output.join('\n')).toContain('fallback');
  });

  it('maps file history filters into the fallback branch path', async () => {
    const root = await makeTmpRoot();
    const trunk = path.join(root, 'trunk');
    const branch1 = path.join(root, 'branch1');
    await makeBranch(trunk, { referenceLocation: pathToFileURL(trunk).href });
    await makeBranch(branch1, { parentLocation: '../trunk' });

    let fallbackTarget = '';
    await loadBazaarRevisionsWithFallback(trunk, {
      log: async () => [],
      logAt: async (target) => {
        fallbackTarget = target;
        return [fakeRevision('9')];
      }
    }, {
      limit: 10,
      path: 'src/app.ts'
    });

    expect(normalize(fallbackTarget)).toBe(normalize(path.join(branch1, 'src', 'app.ts')));
  });
});

async function makeTmpRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-bazaar-history-'));
  tmpRoots.push(root);
  return root;
}

async function makeBranch(
  branchPath: string,
  options: { parentLocation?: string; referenceLocation?: string } = {}
): Promise<void> {
  await fs.mkdir(path.join(branchPath, '.bzr', 'branch'), { recursive: true });
  await fs.mkdir(path.join(branchPath, '.bzr', 'checkout'), { recursive: true });
  await fs.writeFile(
    path.join(branchPath, '.bzr', 'branch', 'format'),
    options.referenceLocation ? 'Bazaar-NG Branch Reference Format 1\n' : 'Bazaar Branch Format 7\n'
  );
  if (options.referenceLocation) {
    await fs.writeFile(path.join(branchPath, '.bzr', 'branch', 'location'), `${options.referenceLocation}\n`);
  }
  if (options.parentLocation) {
    await fs.writeFile(
      path.join(branchPath, '.bzr', 'branch', 'branch.conf'),
      `parent_location = ${options.parentLocation}\n`
    );
  }
}

function fakeRevision(revno: string): BazaarRevision {
  return {
    revno,
    revisionId: `revision-${revno}`,
    parentIds: [],
    tags: [],
    committer: 'test',
    branchNick: 'branch1',
    timestamp: 'Sat 2026-05-16 17:48:18 +0900',
    message: `message ${revno}`,
    depth: 0
  };
}

function normalize(value: string): string {
  return path.win32.resolve(value).replace(/\\/g, '/');
}
