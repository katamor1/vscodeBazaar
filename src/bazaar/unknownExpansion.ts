import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { BazaarChange } from './types';

export async function expandUnknownDirectories(rootPath: string, changes: readonly BazaarChange[]): Promise<BazaarChange[]> {
  const ignorePatterns = await readIgnorePatterns(rootPath);
  const expanded: BazaarChange[] = [];

  for (const change of changes) {
    if (change.kind !== 'unknown' || !looksLikeDirectory(change.path)) {
      expanded.push(change);
      continue;
    }

    const directoryPath = path.join(rootPath, change.path);
    if (!(await isDirectory(directoryPath))) {
      expanded.push(change);
      continue;
    }

    const files = await walkUnknownDirectory(rootPath, directoryPath, ignorePatterns);
    if (files.length === 0) {
      expanded.push(change);
      continue;
    }

    expanded.push(...files.map((filePath) => ({ path: filePath, kind: 'unknown' as const })));
  }

  return expanded;
}

async function walkUnknownDirectory(rootPath: string, directoryPath: string, ignorePatterns: readonly string[]): Promise<string[]> {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === '.bzr') {
      continue;
    }

    const absolutePath = path.join(directoryPath, entry.name);
    const relativePath = normalizeRelative(path.relative(rootPath, absolutePath));
    if (isIgnored(relativePath, entry.isDirectory(), ignorePatterns)) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...await walkUnknownDirectory(rootPath, absolutePath, ignorePatterns));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

async function readIgnorePatterns(rootPath: string): Promise<string[]> {
  try {
    const content = await fs.readFile(path.join(rootPath, '.bzrignore'), 'utf8');
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
  } catch {
    return [];
  }
}

async function isDirectory(targetPath: string): Promise<boolean> {
  try {
    return (await fs.stat(targetPath)).isDirectory();
  } catch {
    return false;
  }
}

function looksLikeDirectory(pathText: string): boolean {
  return pathText.endsWith('/') || pathText.endsWith('\\');
}

function isIgnored(relativePath: string, isDirectoryEntry: boolean, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => {
    const normalizedPattern = normalizeRelative(pattern);
    if (normalizedPattern.endsWith('/')) {
      const directoryPattern = normalizedPattern.slice(0, -1);
      return isDirectoryEntry && (relativePath === directoryPattern || relativePath.startsWith(`${directoryPattern}/`));
    }

    if (!normalizedPattern.includes('/')) {
      return wildcardMatch(path.posix.basename(relativePath), normalizedPattern);
    }

    return wildcardMatch(relativePath, normalizedPattern);
  });
}

function wildcardMatch(value: string, pattern: string): boolean {
  const regexSource = pattern
    .split('')
    .map((character) => {
      if (character === '*') {
        return '.*';
      }
      if (character === '?') {
        return '.';
      }
      return escapeRegex(character);
    })
    .join('');
  const regex = new RegExp(`^${regexSource}$`);
  return regex.test(value);
}

function escapeRegex(value: string): string {
  return value.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

function normalizeRelative(pathText: string): string {
  return pathText.replace(/\\/g, '/').replace(/^\.\//, '');
}
