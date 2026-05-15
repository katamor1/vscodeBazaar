import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { expandUnknownDirectories } from '../src/bazaar/unknownExpansion';
import type { BazaarChange } from '../src/bazaar/types';

describe('expandUnknownDirectories', () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(tempRoots.map((root) => fs.rm(root, { recursive: true, force: true })));
    tempRoots.length = 0;
  });

  it('expands unknown directories into file entries and skips .bzr plus basic ignore patterns', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-bazaar-unknown-'));
    tempRoots.push(root);
    await fs.mkdir(path.join(root, '.agents', 'nested'), { recursive: true });
    await fs.mkdir(path.join(root, '.agents', '.bzr'), { recursive: true });
    await fs.writeFile(path.join(root, '.bzrignore'), '*.log\n');
    await fs.writeFile(path.join(root, '.agents', 'a.txt'), 'a');
    await fs.writeFile(path.join(root, '.agents', 'debug.log'), 'ignored');
    await fs.writeFile(path.join(root, '.agents', 'nested', 'b.txt'), 'b');
    await fs.writeFile(path.join(root, '.agents', '.bzr', 'internal.txt'), 'skip');

    const changes: BazaarChange[] = [
      { path: '.agents/', kind: 'unknown' },
      { path: '.bzrignore', kind: 'unknown' },
      { path: 'tracked.ts', kind: 'modified' }
    ];

    await expect(expandUnknownDirectories(root, changes)).resolves.toEqual([
      { path: '.agents/a.txt', kind: 'unknown' },
      { path: '.agents/nested/b.txt', kind: 'unknown' },
      { path: '.bzrignore', kind: 'unknown' },
      { path: 'tracked.ts', kind: 'modified' }
    ]);
  });
});
