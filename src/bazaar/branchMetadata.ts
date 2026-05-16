import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface BazaarBranchMetadata {
  path: string;
  name: string;
  current: boolean;
  isWorkingTree: boolean;
  parentLocation?: string;
  pushLocation?: string;
  branchReferenceLocation?: string;
  isSelfReferentialReference: boolean;
}

interface BranchConfig {
  parentLocation?: string;
  pushLocation?: string;
}

export async function inspectLocalBranchMetadata(
  branchPath: string,
  currentRoot = branchPath
): Promise<BazaarBranchMetadata | undefined> {
  const resolvedPath = normalizePath(branchPath);
  const bzrPath = path.win32.join(resolvedPath, '.bzr');
  const hasBranch = await exists(path.win32.join(bzrPath, 'branch'));
  const hasCheckout = await exists(path.win32.join(bzrPath, 'checkout'));
  if (!hasBranch && !hasCheckout) {
    return undefined;
  }

  const branchReferenceLocation = resolveLocalLocation(
    resolvedPath,
    await readTrimmed(path.win32.join(bzrPath, 'branch', 'location'))
  );
  const config = parseBranchConfig(
    await readTrimmed(path.win32.join(bzrPath, 'branch', 'branch.conf'))
  );

  return {
    path: resolvedPath,
    name: path.win32.basename(resolvedPath) || resolvedPath,
    current: samePath(resolvedPath, currentRoot),
    isWorkingTree: hasCheckout,
    parentLocation: resolveLocalLocation(resolvedPath, config.parentLocation),
    pushLocation: resolveLocalLocation(resolvedPath, config.pushLocation),
    branchReferenceLocation,
    isSelfReferentialReference: branchReferenceLocation ? samePath(resolvedPath, branchReferenceLocation) : false
  };
}

export async function discoverSiblingBranchMetadata(rootPath: string): Promise<BazaarBranchMetadata[]> {
  const root = normalizePath(rootPath);
  const parent = path.win32.dirname(root);
  let entries: Array<{ name: string; isDirectory: () => boolean }>;
  try {
    entries = await fs.readdir(parent, { withFileTypes: true });
  } catch {
    return [];
  }

  const branches: BazaarBranchMetadata[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const branch = await inspectLocalBranchMetadata(path.win32.join(parent, entry.name), root);
    if (branch) {
      branches.push(branch);
    }
  }

  return branches.sort(compareBranches);
}

export async function resolveHistoryFallbackSource(rootPath: string): Promise<BazaarBranchMetadata | undefined> {
  const current = await inspectLocalBranchMetadata(rootPath);
  if (!current?.isSelfReferentialReference) {
    return undefined;
  }

  const siblings = (await discoverSiblingBranchMetadata(rootPath))
    .filter((branch) => !samePath(branch.path, current.path) && !branch.isSelfReferentialReference);
  return siblings.find((branch) => sameOptionalPath(branch.parentLocation, current.path))
    ?? siblings.find((branch) => sameOptionalPath(branch.pushLocation, current.path))
    ?? siblings[0];
}

export function metadataToBazaarBranch(metadata: BazaarBranchMetadata) {
  return {
    name: metadata.name,
    path: metadata.path,
    current: metadata.current
  };
}

function compareBranches(left: BazaarBranchMetadata, right: BazaarBranchMetadata): number {
  if (left.current !== right.current) {
    return left.current ? -1 : 1;
  }
  return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
}

function parseBranchConfig(content: string | undefined): BranchConfig {
  const config: BranchConfig = {};
  for (const line of content?.split(/\r?\n/) ?? []) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (!match) {
      continue;
    }
    const key = match[1].trim();
    const value = match[2].trim();
    if (key === 'parent_location') {
      config.parentLocation = value;
    } else if (key === 'push_location') {
      config.pushLocation = value;
    }
  }
  return config;
}

function resolveLocalLocation(basePath: string, location: string | undefined): string | undefined {
  const trimmed = location?.trim();
  if (!trimmed) {
    return undefined;
  }

  const filePath = fileUrlToPath(trimmed);
  if (filePath) {
    return normalizePath(filePath);
  }

  if (path.win32.isAbsolute(trimmed)) {
    return normalizePath(trimmed);
  }

  if (looksLikeRemoteUrl(trimmed)) {
    return undefined;
  }

  return normalizePath(path.win32.resolve(basePath, trimmed));
}

function fileUrlToPath(location: string): string | undefined {
  if (!/^file:/i.test(location)) {
    return undefined;
  }
  try {
    return fileURLToPath(location);
  } catch {
    return undefined;
  }
}

function looksLikeRemoteUrl(location: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(location) && !/^[a-z]:[\\/]/i.test(location);
}

async function readTrimmed(filePath: string): Promise<string | undefined> {
  try {
    return (await fs.readFile(filePath, 'utf8')).trim();
  } catch {
    return undefined;
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sameOptionalPath(left: string | undefined, right: string): boolean {
  return left !== undefined && samePath(left, right);
}

function samePath(left: string, right: string): boolean {
  return normalizeForCompare(left) === normalizeForCompare(right);
}

function normalizeForCompare(value: string): string {
  return normalizePath(value).replace(/\/+$/, '').toLowerCase();
}

function normalizePath(value: string): string {
  return path.win32.resolve(value).replace(/\\/g, '/');
}
