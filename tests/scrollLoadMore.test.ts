import { describe, expect, it } from 'vitest';
import { shouldAutoLoadMore } from '../src/views/scrollLoadMore';

describe('shouldAutoLoadMore', () => {
  it('does not trigger before the last five percent of scrollable content', () => {
    expect(shouldAutoLoadMore({
      scrollTop: 849,
      clientHeight: 100,
      scrollHeight: 1000,
      canLoadMore: true,
      loading: false
    })).toBe(false);
  });

  it('triggers at or after the last five percent of scrollable content', () => {
    expect(shouldAutoLoadMore({
      scrollTop: 850,
      clientHeight: 100,
      scrollHeight: 1000,
      canLoadMore: true,
      loading: false
    })).toBe(true);
  });

  it('does not trigger while loading or when no more data is available', () => {
    const base = {
      scrollTop: 900,
      clientHeight: 100,
      scrollHeight: 1000
    };

    expect(shouldAutoLoadMore({ ...base, canLoadMore: true, loading: true })).toBe(false);
    expect(shouldAutoLoadMore({ ...base, canLoadMore: false, loading: false })).toBe(false);
  });
});
