import type { IncludedSet } from '../bazaar/staging';
import type { BazaarChange, BazaarConflict } from '../bazaar/types';

export interface WorkspaceGroups {
  included: BazaarChange[];
  changes: BazaarChange[];
  untracked: BazaarChange[];
  conflicts: BazaarConflict[];
}

export function groupWorkspaceState(
  changes: readonly BazaarChange[],
  conflicts: readonly BazaarConflict[],
  includedSet: IncludedSet
): WorkspaceGroups {
  const conflictPaths = new Set(conflicts.map((conflict) => normalizeKey(conflict.path)));
  const nonConflictingChanges = changes.filter((change) => !conflictPaths.has(normalizeKey(change.path)));

  return {
    included: includedSet.getIncludedChanges(nonConflictingChanges),
    changes: includedSet
      .getRemainingChanges(nonConflictingChanges)
      .filter((change) => change.kind !== 'unknown'),
    untracked: includedSet
      .getRemainingChanges(nonConflictingChanges)
      .filter((change) => change.kind === 'unknown'),
    conflicts: [...conflicts]
  };
}

function normalizeKey(pathText: string): string {
  return pathText.replace(/\\/g, '/');
}
