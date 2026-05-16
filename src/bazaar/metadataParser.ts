import type {
  BazaarAnnotation,
  BazaarBranch,
  BazaarCleanTreeCandidate,
  BazaarCleanTreeKind,
  BazaarInfo,
  BazaarShelf,
  BazaarTag
} from './types';

export function parseTags(output: string): BazaarTag[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.*?)\s+(\S+)$/);
      return {
        name: (match?.[1] ?? line).trim(),
        revision: (match?.[2] ?? '').trim()
      };
    })
    .filter((tag) => tag.name && tag.revision);
}

export function parseBranches(output: string, currentNick: string): BazaarBranch[] {
  const branches = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const markedCurrent = line.startsWith('*');
      const cleanLine = line.replace(/^\*\s*/, '').trim();
      const name = cleanLine === '(デフォルト)' ? currentNick : cleanLine;
      return {
        name,
        path: cleanLine === '(デフォルト)' ? '.' : cleanLine,
        current: markedCurrent || name === currentNick
      };
    });

  if (branches.length === 0 && currentNick) {
    return [{ name: currentNick, path: '.', current: true }];
  }

  return branches;
}

export function parseInfo(output: string): BazaarInfo {
  const info: BazaarInfo = {};
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (!match) {
      continue;
    }

    const key = match[1].trim().toLowerCase();
    const value = match[2].trim();
    if (key === 'branch root') {
      info.branchRoot = value;
    } else if (key === 'repository' || key === 'shared repository') {
      info.repository = value;
    } else if (key === 'checkout root' || key === 'light checkout root') {
      info.checkoutRoot = value;
    } else if (key === 'checkout of branch') {
      info.checkoutOfBranch = value;
    }
  }
  return info;
}

export function parseAnnotations(output: string): BazaarAnnotation[] {
  return output
    .split(/\r?\n/)
    .map((line, index) => {
      const match = line.match(/^\s*(\S+)\s+(.+?)\s*\|\s?(.*)$/);
      if (!match) {
        return undefined;
      }

      const authorAndMaybeDate = match[2].trim();
      const dated = authorAndMaybeDate.match(/^(.+?)\s+(\d{4}-\d{2}-\d{2})(?:\s+\S+)?$/);

      const annotation: BazaarAnnotation = {
        line: index + 1,
        revno: match[1],
        author: (dated?.[1] ?? authorAndMaybeDate).trim(),
        text: match[3]
      };
      if (dated?.[2]) {
        annotation.date = dated[2];
      }
      return annotation;
    })
    .filter((annotation): annotation is BazaarAnnotation => Boolean(annotation));
}

export function parseShelves(output: string): BazaarShelf[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+):\s*(.*)$/);
      if (!match) {
        return undefined;
      }
      return { id: match[1], message: match[2].trim() };
    })
    .filter((shelf): shelf is BazaarShelf => Boolean(shelf));
}

export function parseCleanTreeDryRun(output: string, kind: BazaarCleanTreeKind): BazaarCleanTreeCandidate[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.endsWith(':'))
    .map((path) => ({ path, kind }));
}

export function parseConflictTextPaths(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
