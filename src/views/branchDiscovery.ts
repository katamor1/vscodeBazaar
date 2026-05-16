import * as path from 'node:path';
import type { BazaarBranch, BazaarInfo } from '../bazaar/types';

export interface DiscoveredBranches {
  location: string;
  branches: readonly BazaarBranch[];
}

export function resolveBranchDiscoveryLocations(
  rootPath: string,
  info: BazaarInfo,
  extraLocations: readonly string[] = []
): string[] {
  const root = normalizePath(rootPath);
  const siblingBase = normalizePath(path.win32.dirname(root));
  const candidates = [
    resolveOptionalLocation(root, info.repository),
    siblingBase,
    ...extraLocations.map((location) => resolveLocation(root, location))
  ];

  const locations: string[] = [];
  for (const candidate of candidates) {
    if (!candidate || isSameOrInsidePath(root, candidate)) {
      continue;
    }
    addUniqueLocation(locations, candidate);
  }

  return locations.length > 0 ? locations : ['.'];
}

export function mergeDiscoveredBranches(
  rootPath: string,
  discoveredBranches: readonly DiscoveredBranches[]
): BazaarBranch[] {
  const root = normalizePath(rootPath);
  const byPath = new Map<string, BazaarBranch>();

  for (const discovered of discoveredBranches) {
    const location = normalizeDiscoveryLocation(root, discovered.location);
    for (const branch of discovered.branches) {
      const normalized = normalizeDiscoveredBranch(root, location, branch);
      const key = normalizeForCompare(normalized.path);
      const existing = byPath.get(key);
      if (!existing) {
        byPath.set(key, normalized);
        continue;
      }
      if (normalized.current && !existing.current) {
        byPath.set(key, { ...existing, name: normalized.name, current: true });
      }
    }
  }

  return [...byPath.values()];
}

export function includeCheckoutRootBranch(
  rootPath: string,
  info: BazaarInfo,
  branches: readonly BazaarBranch[]
): BazaarBranch[] {
  if (!info.checkoutRoot?.trim()) {
    return [...branches];
  }

  const root = normalizePath(rootPath);
  const checkoutPath = resolveLocation(root, info.checkoutRoot.trim());
  const checkoutKey = normalizeForCompare(checkoutPath);
  if (branches.some((branch) => normalizeForCompare(branch.path) === checkoutKey)) {
    return [...branches];
  }

  return [
    ...branches,
    {
      name: path.win32.basename(checkoutPath) || checkoutPath,
      path: checkoutPath,
      current: false
    }
  ];
}

function normalizeDiscoveredBranch(
  root: string,
  discoveryLocation: string,
  branch: BazaarBranch
): BazaarBranch {
  const rawPath = branch.path.trim();
  const resolvedPath = rawPath === '.'
    ? root
    : normalizePath(path.win32.isAbsolute(rawPath) ? rawPath : path.win32.resolve(discoveryLocation, rawPath));
  return {
    name: displayNameFor(branch.name, resolvedPath),
    path: resolvedPath,
    current: branch.current
  };
}

function normalizeDiscoveryLocation(root: string, location: string): string {
  return location === '.' ? root : resolveLocation(root, location);
}

function resolveOptionalLocation(root: string, location: string | undefined): string | undefined {
  if (!location?.trim()) {
    return undefined;
  }
  return resolveLocation(root, location.trim());
}

function resolveLocation(root: string, location: string): string {
  return normalizePath(path.win32.isAbsolute(location) ? location : path.win32.resolve(root, location));
}

function addUniqueLocation(locations: string[], candidate: string): void {
  const key = normalizeForCompare(candidate);
  if (!locations.some((location) => normalizeForCompare(location) === key)) {
    locations.push(candidate);
  }
}

function displayNameFor(name: string, resolvedPath: string): string {
  const trimmed = name.trim();
  if (trimmed && trimmed !== '.' && !trimmed.includes('/') && !trimmed.includes('\\')) {
    return trimmed;
  }
  return path.win32.basename(resolvedPath) || trimmed || resolvedPath;
}

function isSameOrInsidePath(parent: string, candidate: string): boolean {
  const normalizedParent = normalizeForCompare(parent);
  const normalizedCandidate = normalizeForCompare(candidate);
  return normalizedCandidate === normalizedParent || normalizedCandidate.startsWith(`${normalizedParent}/`);
}

function normalizeForCompare(value: string): string {
  return normalizePath(value).replace(/\/+$/, '').toLowerCase();
}

function normalizePath(value: string): string {
  return path.win32.resolve(value).replace(/\\/g, '/');
}
