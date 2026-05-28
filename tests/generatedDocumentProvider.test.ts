import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  EventEmitter: class {
    event = vi.fn();
    dispose = vi.fn();
  },
  Uri: {
    from(value: { scheme: string; path: string; query: string }) {
      return {
        ...value,
        toString: () => `${value.scheme}:${value.path}?${value.query}`
      };
    }
  },
  workspace: {
    openTextDocument: vi.fn(async (uri) => ({ uri }))
  }
}));

import { BazaarGeneratedDocumentProvider } from '../src/scm/generatedDocumentProvider';

describe('BazaarGeneratedDocumentProvider', () => {
  it('releases generated document content for closed URIs', () => {
    const provider = new BazaarGeneratedDocumentProvider();
    const first = provider.createUri('First diff', 'first content', 'diff');
    const second = provider.createUri('Second diff', 'second content', 'diff');

    provider.deleteUri(first);

    expect(provider.provideTextDocumentContent(first)).toBe('');
    expect(provider.provideTextDocumentContent(second)).toBe('second content');
  });
});
