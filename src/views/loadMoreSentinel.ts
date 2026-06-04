export interface LoadMoreSentinelState {
  canLoadMore: boolean;
  loading: boolean;
}

export interface LoadMoreSentinelModel {
  visible: boolean;
  observe: boolean;
  busy: boolean;
  label: string;
}

export interface LoadMoreSentinelIntersection {
  isIntersecting: boolean;
  canLoadMore: boolean;
  loading: boolean;
}

export interface LoadMoreRevision {
  revno: string;
}

export function createLoadMoreSentinel(state: LoadMoreSentinelState): LoadMoreSentinelModel {
  if (!state.canLoadMore && !state.loading) {
    return {
      visible: false,
      observe: false,
      busy: false,
      label: ''
    };
  }

  return {
    visible: true,
    observe: state.canLoadMore && !state.loading,
    busy: state.loading,
    label: state.loading ? '続きを読み込み中...' : '続きを表示'
  };
}

export function shouldRequestLoadMoreFromSentinel(state: LoadMoreSentinelIntersection): boolean {
  return state.isIntersecting && state.canLoadMore && !state.loading;
}

export function canLoadMoreRevisions(revisions: readonly LoadMoreRevision[]): boolean {
  const lastRevision = revisions[revisions.length - 1];
  return Boolean(lastRevision && lastRevision.revno.trim() !== '1');
}
