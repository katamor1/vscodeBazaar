import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutputChannel } from 'vscode';
import type { BazaarClient } from '../src/bazaar/client';
import { encodeRevisionDocumentQuery } from '../src/scm/revisionDocumentQuery';

vi.mock('vscode', () => ({
  EventEmitter: class {
    event = vi.fn();
    dispose = vi.fn();
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn(() => 'utf8')
    }))
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
  let catAtRevisionBytes: ReturnType<typeof vi.fn>;
  let appendLine: ReturnType<typeof vi.fn>;
  let provider: BazaarRevisionDocumentProvider;

  beforeEach(() => {
    catAtRevision = vi.fn();
    catAtRevisionBytes = vi.fn();
    appendLine = vi.fn();
    provider = new BazaarRevisionDocumentProvider(
      { catAtRevision, catAtRevisionBytes } as unknown as BazaarClient,
      { appendLine } as unknown as OutputChannel
    );
  });

  it('returns empty content for malformed URI query without calling Bazaar', async () => {
    const content = await provider.provideTextDocumentContent(uriWithQuery('%7Bbad-json'));

    expect(content).toBe('');
    expect(catAtRevisionBytes).not.toHaveBeenCalled();
    expect(appendLine).toHaveBeenCalledWith(expect.stringContaining('不正な Bazaar リビジョンドキュメント URI を無視します'));
  });

  it('returns empty content for empty revision query without calling Bazaar', async () => {
    const content = await provider.provideTextDocumentContent(uriWithQuery(encodeRevisionDocumentQuery({
      path: 'README.md',
      revision: ''
    })));

    expect(content).toBe('');
    expect(catAtRevisionBytes).not.toHaveBeenCalled();
    expect(appendLine).toHaveBeenCalledWith(expect.stringContaining('不正な Bazaar リビジョンドキュメント URI を無視します'));
  });

  it('catches Bazaar cat failures and logs diagnostics', async () => {
    catAtRevisionBytes.mockRejectedValue(new Error('cat failed'));

    const content = await provider.provideTextDocumentContent(uriWithQuery(encodeRevisionDocumentQuery({
      path: 'README.md',
      revision: '1'
    })));

    expect(content).toBe('');
    expect(catAtRevisionBytes).toHaveBeenCalledWith('1', 'README.md');
    expect(appendLine).toHaveBeenCalledWith(expect.stringContaining('README.md の Bazaar リビジョン 1 を読み込めませんでした: cat failed'));
  });

  it('decodes raw Bazaar cat bytes as repository file content', async () => {
    catAtRevisionBytes.mockResolvedValue(Buffer.from([0xc6, 0xfc, 0xcb, 0xdc, 0xb8, 0xec, 0x0a]));

    const content = await provider.provideTextDocumentContent(uriWithQuery(encodeRevisionDocumentQuery({
      path: 'README.md',
      revision: '1'
    })));

    expect(content).toBe('日本語\n');
    expect(catAtRevisionBytes).toHaveBeenCalledWith('1', 'README.md');
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
