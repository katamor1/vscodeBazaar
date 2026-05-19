import { describe, expect, it } from 'vitest';
import { clearHistoryFilters } from '../src/views/historyFilters';

describe('clearHistoryFilters', () => {
  it.each([
    [{ query: 'release', pathFilter: 'src/app.ts' }],
    [{ query: 'release' }],
    [{ query: '', pathFilter: 'src/app.ts' }],
    [{ query: '' }]
  ])('clears both search query and file filter from %o', (state) => {
    expect(clearHistoryFilters(state)).toEqual({
      query: '',
      pathFilter: undefined
    });
  });
});
