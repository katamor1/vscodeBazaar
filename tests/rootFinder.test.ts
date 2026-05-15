import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findDotBzrRoot } from '../src/bazaar/rootFinder';

describe('findDotBzrRoot', () => {
  it('uses the opened folder when it contains .bzr', async () => {
    const root = path.resolve('C:/repo/project');

    await expect(findDotBzrRoot(root, async (candidate) => candidate === root)).resolves.toBe(root);
  });

  it('walks upward to find the Bazaar root without invoking bzr root', async () => {
    const root = path.resolve('C:/repo/project');
    const child = path.join(root, 'src', 'feature');

    await expect(findDotBzrRoot(child, async (candidate) => candidate === root)).resolves.toBe(root);
  });

  it('returns undefined when no ancestor contains .bzr', async () => {
    await expect(findDotBzrRoot(path.resolve('C:/repo/project'), async () => false)).resolves.toBeUndefined();
  });
});
