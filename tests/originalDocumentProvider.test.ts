import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutputChannel } from 'vscode';
import type { BazaarClient } from '../src/bazaar/client';

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

import { BazaarOriginalDocumentProvider } from '../src/scm/originalDocumentProvider';

describe('BazaarOriginalDocumentProvider', () => {
  let catBasis: ReturnType<typeof vi.fn>;
  let appendLine: ReturnType<typeof vi.fn>;
  let provider: BazaarOriginalDocumentProvider;

  beforeEach(() => {
    catBasis = vi.fn().mockResolvedValue('basis content');
    appendLine = vi.fn();
    provider = new BazaarOriginalDocumentProvider(
      'C:/repo',
      { catBasis } as unknown as BazaarClient,
      { appendLine } as unknown as OutputChannel
    );
  });

  it('returns empty content for malformed URI query without calling Bazaar', async () => {
    const content = await provider.provideTextDocumentContent(uriWithQuery('%7Bbad-json'));

    expect(content).toBe('');
    expect(catBasis).not.toHaveBeenCalled();
    expect(appendLine).toHaveBeenCalledWith(expect.stringContaining('不正な Bazaar 元ドキュメント URI を無視します'));
  });

  it('rejects absolute and escaping paths without calling Bazaar', async () => {
    for (const path of ['C:/tmp/file.txt', '../secret.txt', 'docs\\..\\secret.txt', '']) {
      const content = await provider.provideTextDocumentContent(uriWithQuery(encodeURIComponent(JSON.stringify({ path }))));

      expect(content).toBe('');
    }

    expect(catBasis).not.toHaveBeenCalled();
  });

  it('passes valid relative paths, including option-like names, to Bazaar safely', async () => {
    await expect(provider.provideTextDocumentContent(uriWithQuery(encodeURIComponent(JSON.stringify({
      path: '--help'
    }))))).resolves.toBe('basis content');

    expect(catBasis).toHaveBeenCalledWith('--help');
  });
});

function uriWithQuery(query: string) {
  return {
    scheme: BazaarOriginalDocumentProvider.scheme,
    path: '/README.md',
    query,
    toString: () => `${BazaarOriginalDocumentProvider.scheme}:/README.md?${query}`
  } as Parameters<BazaarOriginalDocumentProvider['provideTextDocumentContent']>[0];
}
