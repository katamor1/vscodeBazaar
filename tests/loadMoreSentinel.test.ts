import { describe, expect, it } from 'vitest';
import {
  canLoadMoreRevisions,
  createLoadMoreSentinel,
  shouldRequestLoadMoreFromSentinel
} from '../src/views/loadMoreSentinel';

describe('createLoadMoreSentinel', () => {
  it('shows an observable continuation placeholder when more data is available', () => {
    expect(createLoadMoreSentinel({ canLoadMore: true, loading: false })).toEqual({
      visible: true,
      observe: true,
      busy: false,
      label: '続きを表示'
    });
  });

  it('keeps the placeholder visible but unobservable while loading', () => {
    expect(createLoadMoreSentinel({ canLoadMore: true, loading: true })).toEqual({
      visible: true,
      observe: false,
      busy: true,
      label: '続きを読み込み中...'
    });
  });

  it('hides the placeholder when no more data can be loaded', () => {
    expect(createLoadMoreSentinel({ canLoadMore: false, loading: false })).toEqual({
      visible: false,
      observe: false,
      busy: false,
      label: ''
    });
  });
});

describe('shouldRequestLoadMoreFromSentinel', () => {
  it('requests more data only when the sentinel is visible and idle', () => {
    expect(shouldRequestLoadMoreFromSentinel({
      isIntersecting: true,
      canLoadMore: true,
      loading: false
    })).toBe(true);

    expect(shouldRequestLoadMoreFromSentinel({
      isIntersecting: false,
      canLoadMore: true,
      loading: false
    })).toBe(false);

    expect(shouldRequestLoadMoreFromSentinel({
      isIntersecting: true,
      canLoadMore: true,
      loading: true
    })).toBe(false);

    expect(shouldRequestLoadMoreFromSentinel({
      isIntersecting: true,
      canLoadMore: false,
      loading: false
    })).toBe(false);
  });
});

describe('canLoadMoreRevisions', () => {
  it('keeps loading available until revision 1 is visible at the end', () => {
    expect(canLoadMoreRevisions([{ revno: '2' }])).toBe(true);
    expect(canLoadMoreRevisions([{ revno: '2' }, { revno: ' 1 ' }])).toBe(false);
    expect(canLoadMoreRevisions([])).toBe(false);
  });
});
