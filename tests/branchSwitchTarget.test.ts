import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  hasBazaarWorkingTree,
  resolveBranchSwitchAction
} from '../src/views/branchSwitchTarget';

const tmpRoots: string[] = [];

describe('resolveBranchSwitchAction', () => {
  it('opens another Bazaar working tree instead of running bzr switch', async () => {
    const action = await resolveBranchSwitchAction(
      'C:/repo/trunk',
      'C:/repo/branch1',
      false,
      async () => true
    );

    expect(action).toEqual({
      kind: 'openWorktree',
      targetPath: 'C:/repo/branch1'
    });
  });

  it('keeps bzr switch when the target is the current root', async () => {
    const action = await resolveBranchSwitchAction(
      'C:/Repo/Trunk',
      'c:/repo/trunk',
      true,
      async () => true
    );

    expect(action).toEqual({
      kind: 'bzrSwitch',
      target: 'c:/repo/trunk',
      force: true
    });
  });

  it('falls back to bzr switch when the target is not a working tree', async () => {
    const action = await resolveBranchSwitchAction(
      'C:/repo/trunk',
      'C:/repo/branch-only',
      false,
      async () => false
    );

    expect(action).toEqual({
      kind: 'bzrSwitch',
      target: 'C:/repo/branch-only',
      force: false
    });
  });

  it('falls back to bzr switch when probing the target fails', async () => {
    const action = await resolveBranchSwitchAction(
      'C:/repo/trunk',
      'C:/repo/branch1',
      false,
      async () => {
        throw new Error('permission denied');
      }
    );

    expect(action).toEqual({
      kind: 'bzrSwitch',
      target: 'C:/repo/branch1',
      force: false
    });
  });

  it('resolves relative targets for worktree probing and preserves them for bzr switch fallback', async () => {
    const probedPaths: string[] = [];
    const action = await resolveBranchSwitchAction(
      'C:/repo/trunk',
      '../branch1',
      false,
      async (targetPath) => {
        probedPaths.push(targetPath);
        return false;
      }
    );

    expect(probedPaths).toEqual(['C:/repo/branch1']);
    expect(action).toEqual({
      kind: 'bzrSwitch',
      target: '../branch1',
      force: false
    });
  });

  it('opens relative targets that resolve to another working tree even when force is requested', async () => {
    const action = await resolveBranchSwitchAction(
      'C:/repo/trunk',
      '../branch1',
      true,
      async () => true
    );

    expect(action).toEqual({
      kind: 'openWorktree',
      targetPath: 'C:/repo/branch1'
    });
  });
});

describe('hasBazaarWorkingTree', () => {
  afterEach(async () => {
    for (const root of tmpRoots.splice(0)) {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('requires .bzr/checkout instead of just .bzr', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-bazaar-switch-'));
    tmpRoots.push(root);
    await fs.mkdir(path.join(root, 'worktree', '.bzr'), { recursive: true });
    await fs.mkdir(path.join(root, 'branch-only', '.bzr'), { recursive: true });
    await fs.writeFile(path.join(root, 'worktree', '.bzr', 'checkout'), '');

    await expect(hasBazaarWorkingTree(path.join(root, 'worktree'))).resolves.toBe(true);
    await expect(hasBazaarWorkingTree(path.join(root, 'branch-only'))).resolves.toBe(false);
  });
});
