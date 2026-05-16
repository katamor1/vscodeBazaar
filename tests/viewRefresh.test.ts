import { describe, expect, it } from 'vitest';
import {
  createBranchSwitchRefreshTargets,
  createCommitRefreshTargets,
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
      sourceControl: refreshable('ソース管理'),
      blame: refreshable('blame'),
      explore: refreshable('EXPLORE'),
      history: refreshable('履歴'),
      branches: refreshable('ブランチ'),
      tags: refreshable('タグ'),
      shelves: refreshable('シェルブ'),
      graph: refreshable('グラフ')
    });

    expect(targets.map((target) => target.label)).toEqual([
      'ソース管理',
      'blame',
      'EXPLORE',
      '履歴',
      'ブランチ',
      'タグ',
      'シェルブ',
      'グラフ'
    ]);

    await refreshBazaarViewTargets(targets);
    expect(calls).toEqual([
      'ソース管理',
      'blame',
      'EXPLORE',
      '履歴',
      'ブランチ',
      'タグ',
      'シェルブ',
      'グラフ'
    ]);
  });
});

describe('createCommitRefreshTargets', () => {
  it('refreshes history-backed views after a successful commit', async () => {
    const calls: string[] = [];
    const refreshable = (label: string) => ({
      refresh: () => calls.push(label)
    });
    const targets = createCommitRefreshTargets({
      explore: refreshable('EXPLORE'),
      history: refreshable('履歴'),
      graph: refreshable('グラフ')
    });

    expect(targets.map((target) => target.label)).toEqual([
      'EXPLORE',
      '履歴',
      'グラフ'
    ]);

    await refreshBazaarViewTargets(targets);
    expect(calls).toEqual([
      'EXPLORE',
      '履歴',
      'グラフ'
    ]);
  });
});
