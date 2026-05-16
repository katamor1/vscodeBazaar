import { describe, expect, it } from 'vitest';
import {
  createBranchSwitchRefreshTargets,
  refreshBazaarViewTargets,
  formatViewRefreshFailure
} from '../src/views/viewRefresh';

describe('refreshBazaarViewTargets', () => {
  it('refreshes every target in order', async () => {
    const calls: string[] = [];

    const failures = await refreshBazaarViewTargets([
      { label: 'status', refresh: () => calls.push('status') },
      { label: 'history', refresh: async () => calls.push('history') },
      { label: 'graph', refresh: () => calls.push('graph') }
    ]);

    expect(calls).toEqual(['status', 'history', 'graph']);
    expect(failures).toEqual([]);
  });

  it('keeps refreshing later targets and returns failures', async () => {
    const calls: string[] = [];
    const error = new Error('broken history');

    const failures = await refreshBazaarViewTargets([
      { label: 'status', refresh: () => calls.push('status') },
      {
        label: 'history',
        refresh: () => {
          calls.push('history');
          throw error;
        }
      },
      { label: 'graph', refresh: () => calls.push('graph') }
    ]);

    expect(calls).toEqual(['status', 'history', 'graph']);
    expect(failures).toEqual([{ label: 'history', error }]);
    expect(formatViewRefreshFailure(failures[0])).toBe('history: broken history');
  });
});

describe('createBranchSwitchRefreshTargets', () => {
  it('targets every Bazaar view that can become stale after switching branches', async () => {
    const calls: string[] = [];
    const refreshable = (label: string) => ({
      refresh: () => calls.push(label)
    });

    const targets = createBranchSwitchRefreshTargets({
      sourceControl: refreshable('source control'),
      blame: refreshable('blame'),
      history: refreshable('history'),
      branches: refreshable('branches'),
      tags: refreshable('tags'),
      shelves: refreshable('shelves'),
      graph: refreshable('graph')
    });

    expect(targets.map((target) => target.label)).toEqual([
      'source control',
      'blame',
      'history',
      'branches',
      'tags',
      'shelves',
      'graph'
    ]);

    await refreshBazaarViewTargets(targets);
    expect(calls).toEqual([
      'source control',
      'blame',
      'history',
      'branches',
      'tags',
      'shelves',
      'graph'
    ]);
  });
});
