import { describe, expect, it } from 'vitest';
import {
  annotationsForSelectedLines,
  selectedBlameLineNumbers
} from '../src/views/blameSelection';

function selection(startLine: number, endLine: number) {
  return {
    start: { line: startLine },
    end: { line: endLine }
  };
}

describe('blame selection helpers', () => {
  it('targets only the cursor line for an empty selection', () => {
    expect(selectedBlameLineNumbers([selection(2, 2)])).toEqual([3]);
  });

  it('targets every line in a selected range and deduplicates multiple selections', () => {
    expect(selectedBlameLineNumbers([
      selection(4, 2),
      selection(0, 0),
      selection(3, 5)
    ])).toEqual([1, 3, 4, 5, 6]);
  });

  it('filters annotations to the selected one-based line numbers', () => {
    const annotations = [
      { line: 1, revno: '1' },
      { line: 2, revno: '2' },
      { line: 3, revno: '3' },
      { line: 4, revno: '4' }
    ];

    expect(annotationsForSelectedLines(annotations, [selection(1, 2)])).toEqual([
      { line: 2, revno: '2' },
      { line: 3, revno: '3' }
    ]);
  });

  it('does not decorate anything when no selection is available', () => {
    expect(selectedBlameLineNumbers([])).toEqual([]);
  });
});
