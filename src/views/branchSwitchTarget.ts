import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export type BranchSwitchAction =
  | { kind: 'openWorktree'; targetPath: string }
  | { kind: 'bzrSwitch'; target: string; force: boolean };

export type BazaarWorkingTreeProbe = (targetPath: string) => Promise<boolean>;

export async function resolveBranchSwitchAction(
  rootPath: string,
  target: string,
  force: boolean,
  probe: BazaarWorkingTreeProbe = hasBazaarWorkingTree
): Promise<BranchSwitchAction> {
  const resolvedRoot = normalizePath(path.win32.resolve(rootPath));
  const resolvedTarget = resolveTargetPath(resolvedRoot, target);

  if (samePath(resolvedRoot, resolvedTarget)) {
    return { kind: 'bzrSwitch', target, force };
  }

  try {
    if (await probe(resolvedTarget)) {
      return { kind: 'openWorktree', targetPath: resolvedTarget };
    }
  } catch {
    return { kind: 'bzrSwitch', target, force };
  }

  return { kind: 'bzrSwitch', target, force };
}

export async function hasBazaarWorkingTree(targetPath: string): Promise<boolean> {
  try {
    await fs.stat(path.join(targetPath, '.bzr', 'checkout'));
    return true;
  } catch {
    return false;
  }
}

function resolveTargetPath(rootPath: string, target: string): string {
  const resolved = path.win32.isAbsolute(target)
    ? path.win32.resolve(target)
    : path.win32.resolve(rootPath, target);
  return normalizePath(resolved);
}

function samePath(left: string, right: string): boolean {
  return normalizeForCompare(left) === normalizeForCompare(right);
}

function normalizeForCompare(value: string): string {
  return normalizePath(value).replace(/\/+$/, '').toLowerCase();
}

function normalizePath(value: string): string {
  return path.win32.normalize(value).replace(/\\/g, '/');
}
