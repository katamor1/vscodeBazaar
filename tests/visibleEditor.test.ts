import { describe, expect, it } from 'vitest';
import { findVisibleEditorByUri } from '../src/views/visibleEditor';

function uri(value: string): { toString(): string } {
  return { toString: () => value };
}

describe('findVisibleEditorByUri', () => {
  it('returns the visible editor for the exact URI string', () => {
    const target = uri('file:///workspace/file.txt');
    const editor = { document: { uri: target }, id: 'target' };

    expect(findVisibleEditorByUri([
      { document: { uri: uri('file:///workspace/other.txt') }, id: 'other' },
      editor
    ], target)).toBe(editor);
  });

  it('returns undefined when the diff side is not visible yet', () => {
    expect(findVisibleEditorByUri([
      { document: { uri: uri('file:///workspace/other.txt') }, id: 'other' }
    ], uri('file:///workspace/file.txt'))).toBeUndefined();
  });

  it('matches the full URI including query when revision documents share a path', () => {
    const left = { document: { uri: uri('bazaar-revision:///workspace/file.txt?rev=7&side=left') }, id: 'left' };
    const right = { document: { uri: uri('bazaar-revision:///workspace/file.txt?rev=7&side=right') }, id: 'right' };

    expect(
      findVisibleEditorByUri(
        [left, right],
        uri('bazaar-revision:///workspace/file.txt?rev=7&side=right')
      )
    ).toBe(right);
  });
});
