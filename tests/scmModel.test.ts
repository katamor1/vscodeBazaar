import { describe, expect, it } from 'vitest';
import { IncludedSet } from '../src/bazaar/staging';
import { groupWorkspaceState } from '../src/scm/model';
import type { BazaarChange, BazaarConflict } from '../src/bazaar/types';

describe('groupWorkspaceState', () => {
  it('separates included, tracked changes, untracked files, and conflicts', () => {
    const changes: BazaarChange[] = [
      { path: 'src/app.ts', kind: 'modified' },
      { path: 'docs/spec.md', kind: 'added' },
      { path: 'scratch.txt', kind: 'unknown' },
      { path: 'conflicted.ts', kind: 'modified' },
      { path: 'Pending merge', kind: 'pendingMerge' }
    ];
    const conflicts: BazaarConflict[] = [
      { path: 'conflicted.ts', description: 'Text conflict in conflicted.ts' }
    ];
    const included = new IncludedSet();
    included.include(changes[0]);

    expect(groupWorkspaceState(changes, conflicts, included)).toEqual({
      included: [changes[0]],
      changes: [changes[1], changes[4]],
      untracked: [changes[2]],
      conflicts
    });
  });
});
