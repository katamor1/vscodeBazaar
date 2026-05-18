export interface ScrollLoadMoreState {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  canLoadMore: boolean;
  loading: boolean;
}

export function shouldAutoLoadMore(state: ScrollLoadMoreState, threshold = 0.95): boolean {
  if (!state.canLoadMore || state.loading || state.scrollHeight <= 0) {
    return false;
  }
  return (state.scrollTop + state.clientHeight) / state.scrollHeight >= threshold;
}
