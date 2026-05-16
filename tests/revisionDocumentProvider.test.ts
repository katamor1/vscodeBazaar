import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutputChannel } from 'vscode';
import type { BazaarClient } from '../src/bazaar/client';
import { encodeRevisionDocumentQuery } from '../src/scm/revisionDocumentQuery';

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
  }
}));

import { BazaarRevisionDocumentProvider } from '../src/scm/revisionDocumentProvider';

describe('BazaarRevisionDocumentProvider', () => {
  let catAtRevision: ReturnType<typeof vi.fn>;
  let appendLine: ReturnType<typeof vi.fn>;
  let provider: BazaarRevisionDocumentProvider;

  beforeEach(() => {
    catAtRevision = vi.fn();
    appendLine = vi.fn();
    provider = new BazaarRevisionDocumentProvider(
      { catAtRevision } as unknown as BazaarClient,
      { appendLine } as unknown as OutputChannel
    );
  });

  it('returns empty content for malformed URI query without calling Bazaar', async () => {
    const content = await provider.provideTextDocumentContent(uriWithQuery('%7Bbad-json'));

    expect(content).toBe('');
    expect(catAtRevision).not.toHaveBeenCalled();
    expect(appendLine).toHaveBeenCalledWith(expect.stringContaining('不正な Bazaar リビジョンドキュメント URI を無視します'));
  });

  it('returns empty content for empty revision query without calling Bazaar', async () => {
    const content = await provider.provideTextDocumentContent(uriWithQuery(encodeRevisionDocumentQuery({
      path: 'README.md',
      revision: ''
    })));

    expect(content).toBe('');
    expect(catAtRevision).not.toHaveBeenCalled();
    expect(appendLine).toHaveBeenCalledWith(expect.stringContaining('不正な Bazaar リビジョンドキュメント URI を無視します'));
  });

  it('catches Bazaar cat failures and logs diagnostics', async () => {
    catAtRevision.mockRejectedValue(new Error('cat failed'));

    const content = await provider.provideTextDocumentContent(uriWithQuery(encodeRevisionDocumentQuery({
      path: 'README.md',
      revision: '1'
    })));

    expect(content).toBe('');
    expect(catAtRevision).toHaveBeenCalledWith('1', 'README.md');
    expect(appendLine).toHaveBeenCalledWith(expect.stringContaining('README.md の Bazaar リビジョン 1 を読み込めませんでした: cat failed'));
  });
});

function uriWithQuery(query: string) {
  return {
    scheme: BazaarRevisionDocumentProvider.scheme,
    path: '/README.md',
    query,
    toString: () => `${BazaarRevisionDocumentProvider.scheme}:/README.md?${query}`
  } as Parameters<BazaarRevisionDocumentProvider['provideTextDocumentContent']>[0];
}
