import * as path from 'node:path';
import type { BazaarInfo } from '../bazaar/types';

export interface BranchCreateTarget {
  branchName: string;
  toLocation: string;
}

export type BranchCreateTargetResult =
  | BranchCreateTarget
  | { warning: string };

const INVALID_BRANCH_NAME_MESSAGE = 'Enter a simple branch folder name.';
const DESTINATION_OUTSIDE_WORKSPACE_MESSAGE = 'The Bazaar branch destination must be outside the current workspace.';
const WINDOWS_RESERVED_NAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9'
]);

export function resolveBranchCreateTarget(
  rootPath: string,
  info: BazaarInfo,
  branchNameInput: string
): BranchCreateTargetResult {
  const branchName = normalizeBranchFolderName(branchNameInput);
  if (!branchName) {
    return { warning: INVALID_BRANCH_NAME_MESSAGE };
  }

  const root = toSlash(path.win32.resolve(rootPath));
  const repository = repositoryBaseOutsideRoot(root, info.repository);
  const base = repository ?? toSlash(path.win32.dirname(root));
  const toLocation = toSlash(path.win32.resolve(base, branchName));
  if (isSameOrInsidePath(root, toLocation)) {
    return { warning: DESTINATION_OUTSIDE_WORKSPACE_MESSAGE };
  }

  return { branchName, toLocation };
}

export function validateBranchFolderName(value: string | undefined): string | undefined {
  return normalizeBranchFolderName(value) ? undefined : INVALID_BRANCH_NAME_MESSAGE;
}

function repositoryBaseOutsideRoot(root: string, repository: string | undefined): string | undefined {
  if (!repository?.trim()) {
    return undefined;
  }

  const resolved = toSlash(path.win32.resolve(root, repository.trim()));
  return isSameOrInsidePath(root, resolved) ? undefined : resolved;
}

function normalizeBranchFolderName(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const branchName = value.trim();
  if (!branchName || branchName === '.' || branchName === '..') {
    return undefined;
  }

  if (
    branchName.includes('/') ||
    branchName.includes('\\') ||
    path.win32.isAbsolute(branchName) ||
    /[<>:"|?*\x00-\x1f]/.test(branchName) ||
    branchName.endsWith('.') ||
    branchName.endsWith(' ')
  ) {
    return undefined;
  }

  const deviceName = branchName.split('.')[0].toLowerCase();
  if (WINDOWS_RESERVED_NAMES.has(deviceName)) {
    return undefined;
  }

  return branchName;
}

function isSameOrInsidePath(parent: string, candidate: string): boolean {
  const normalizedParent = normalizeForCompare(parent);
  const normalizedCandidate = normalizeForCompare(candidate);
  return normalizedCandidate === normalizedParent || normalizedCandidate.startsWith(`${normalizedParent}/`);
}

function normalizeForCompare(value: string): string {
  return toSlash(path.win32.resolve(value)).replace(/\/+$/, '').toLowerCase();
}

function toSlash(value: string): string {
  return value.replace(/\\/g, '/');
}
