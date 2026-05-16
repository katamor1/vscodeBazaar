import { PENDING_MERGE_PATH, type BazaarChange, type BazaarChangeKind, type BazaarConflict } from './types';

const sectionKinds = new Map<string, BazaarChangeKind>([
  ['modified', 'modified'],
  ['added', 'added'],
  ['removed', 'removed'],
  ['renamed', 'renamed'],
  ['unknown', 'unknown']
]);

export function parseStatus(output: string): BazaarChange[] {
  const changes: BazaarChange[] = [];
  let currentKind: BazaarChangeKind | undefined;
  const lines = output.split(/\r?\n/);

  for (let index = 0; index < lines.length; index++) {
    const rawLine = lines[index];
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      continue;
    }

    if (isPendingMergeHeader(line)) {
      const pendingLines = [line.trimEnd()];
      while (index + 1 < lines.length) {
        const nextLine = lines[index + 1].trimEnd();
        if (!nextLine.trim()) {
          index++;
          continue;
        }
        if (/^\S/.test(nextLine)) {
          break;
        }
        pendingLines.push(nextLine);
        index++;
      }
      changes.push({
        path: PENDING_MERGE_PATH,
        kind: 'pendingMerge',
        description: pendingLines.join('\n')
      });
      currentKind = undefined;
      continue;
    }

    const sectionMatch = line.match(/^([A-Za-z ]+):$/);
    if (sectionMatch) {
      currentKind = sectionKinds.get(sectionMatch[1].trim().toLowerCase());
      continue;
    }

    if (/^\S/.test(line)) {
      currentKind = undefined;
      continue;
    }

    if (!currentKind) {
      continue;
    }

    const pathText = line.trim();
    if (!pathText) {
      continue;
    }

    if (currentKind === 'renamed') {
      const renamed = pathText.match(/^(.+?)\s+=>\s+(.+)$/);
      if (renamed) {
        changes.push({
          path: normalizePath(renamed[2]),
          kind: 'renamed',
          oldPath: normalizePath(renamed[1])
        });
        continue;
      }
    }

    changes.push({ path: normalizePath(pathText), kind: currentKind });
  }

  return changes;
}

export function parseUnknownLs(output: string): BazaarChange[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      path: normalizePath(line.replace(/[\\/@*]$/, '')),
      kind: 'unknown' as const
    }));
}

export function parseConflicts(output: string): BazaarConflict[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((description) => ({
      path: extractConflictPath(description),
      description
    }));
}

function extractConflictPath(description: string): string {
  const inIndex = description.lastIndexOf(' in ');
  if (inIndex >= 0) {
    return normalizePath(description.slice(inIndex + 4));
  }

  const pathConflictPrefix = 'Path conflict:';
  if (description.startsWith(pathConflictPrefix)) {
    return normalizePath(description.slice(pathConflictPrefix.length));
  }

  return normalizePath(description);
}

function normalizePath(pathText: string): string {
  return pathText.trim().replace(/\\/g, '/');
}

function isPendingMergeHeader(line: string): boolean {
  return /^pending merge tips:/i.test(line.trim());
}
