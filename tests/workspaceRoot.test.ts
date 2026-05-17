import { describe, expect, it, vi } from 'vitest';
import { findFirstBazaarWorkspaceRoot } from '../src/bazaar/workspaceRoot';

describe('findFirstBazaarWorkspaceRoot', () => {
  it('selects the first workspace folder that resolves to a Bazaar root', async () => {
    const output = { appendLine: vi.fn() };
    const rootByWorkspace = new Map([
      ['C:/repo/plain', undefined],
      ['C:/repo/bzr', 'C:/repo/bzr']
    ]);

    const root = await findFirstBazaarWorkspaceRoot(
      ['C:/repo/plain', 'C:/repo/bzr'],
      (workspacePath) => ({
        root: vi.fn(async () => {
          if (workspacePath === 'C:/repo/plain') {
            throw new Error('not a branch');
          }
          return `${workspacePath}/from-bzr-root`;
        })
      }),
      output,
      async (workspacePath) => rootByWorkspace.get(workspacePath)
    );

    expect(root).toBe('C:/repo/bzr');
  });

  it('falls back to bzr root per workspace and returns undefined when none resolve', async () => {
    const output = { appendLine: vi.fn() };
    const rootCalls: string[] = [];

    const root = await findFirstBazaarWorkspaceRoot(
      ['C:/repo/plain1', 'C:/repo/plain2'],
      (workspacePath) => ({
        root: vi.fn(async () => {
          rootCalls.push(workspacePath);
          throw new Error('not a branch');
        })
      }),
      output,
      async () => undefined
    );

    expect(root).toBeUndefined();
    expect(rootCalls).toEqual(['C:/repo/plain1', 'C:/repo/plain2']);
  });
});
