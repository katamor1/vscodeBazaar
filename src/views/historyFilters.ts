export interface HistoryFilterState {
  query: string;
  pathFilter?: string;
}

export function clearHistoryFilters(_state: HistoryFilterState): HistoryFilterState {
  return {
    query: '',
    pathFilter: undefined
  };
}
