import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export type DotBzrProbe = (candidateRoot: string) => Promise<boolean>;

export async function findDotBzrRoot(startPath: string, probe: DotBzrProbe = hasDotBzr): Promise<string | undefined> {
  let current = path.resolve(startPath);

  while (true) {
    if (await probe(current)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

async function hasDotBzr(candidateRoot: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path.join(candidateRoot, '.bzr'));
    return stat.isDirectory();
  } catch {
    return false;
  }
}
