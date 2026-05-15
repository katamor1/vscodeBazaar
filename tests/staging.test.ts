import { describe, expect, it } from 'vitest';
import { IncludedSet } from '../src/bazaar/staging';
import type { BazaarChange } from '../src/bazaar/types';

describe('IncludedSet', () => {
  const changes: BazaarChange[] = [
    { path: 'src/app.ts', kind: 'modified' },
    { path: 'docs/spec.md', kind: 'unknown' },
    { path: 'removed.ts', kind: 'removed' }
  ];

  it('tracks included paths and filters changes in display order', () => {
    const included = new IncludedSet();

    included.include(changes[1]);
    included.include(changes[0]);

    expect(included.has(changes[0])).toBe(true);
    expect(included.getIncludedChanges(changes)).toEqual([changes[0], changes[1]]);
    expect(included.getRemainingChanges(changes)).toEqual([changes[2]]);
  });

  it('removes stale included paths after refresh', () => {
    const included = new IncludedSet();
    included.include(changes[0]);
    included.include({ path: 'gone.ts', kind: 'modified' });

    included.prune(changes);

    expect(included.paths()).toEqual(['src/app.ts']);
  });

  it('can include every committable change except conflicts', () => {
    const included = new IncludedSet();

    included.includeAll(changes);

    expect(included.paths()).toEqual(['src/app.ts', 'docs/spec.md', 'removed.ts']);
  });
});
