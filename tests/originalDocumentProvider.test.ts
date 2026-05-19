import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutputChannel } from 'vscode';
import type { BazaarClient } from '../src/bazaar/client';

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

import { BazaarOriginalDocumentProvider } from '../src/scm/originalDocumentProvider';

describe('BazaarOriginalDocumentProvider', () => {
  let catBasis: ReturnType<typeof vi.fn>;
  let catBasisBytes: ReturnType<typeof vi.fn>;
  let appendLine: ReturnType<typeof vi.fn>;
  let provider: BazaarOriginalDocumentProvider;

  beforeEach(() => {
    catBasis = vi.fn().mockResolvedValue('basis content');
    catBasisBytes = vi.fn().mockResolvedValue(Buffer.from('basis content', 'utf8'));
    appendLine = vi.fn();
    provider = new BazaarOriginalDocumentProvider(
      'C:/repo',
      { catBasis, catBasisBytes } as unknown as BazaarClient,
      { appendLine } as unknown as OutputChannel
    );
  });

  it('returns empty content for malformed URI query without calling Bazaar', async () => {
    const content = await provider.provideTextDocumentContent(uriWithQuery('%7Bbad-json'));

    expect(content).toBe('');
    expect(catBasisBytes).not.toHaveBeenCalled();
    expect(appendLine).toHaveBeenCalledWith(expect.stringContaining('不正な Bazaar 元ドキュメント URI を無視します'));
  });

  it('rejects absolute and escaping paths without calling Bazaar', async () => {
    for (const path of ['C:/tmp/file.txt', '../secret.txt', 'docs\\..\\secret.txt', '']) {
      const content = await provider.provideTextDocumentContent(uriWithQuery(encodeURIComponent(JSON.stringify({ path }))));

      expect(content).toBe('');
    }

    expect(catBasisBytes).not.toHaveBeenCalled();
  });

  it('passes valid relative paths, including option-like names, to Bazaar safely', async () => {
    await expect(provider.provideTextDocumentContent(uriWithQuery(encodeURIComponent(JSON.stringify({
      path: '--help'
    }))))).resolves.toBe('basis content');

    expect(catBasisBytes).toHaveBeenCalledWith('--help');
  });

  it('decodes raw Bazaar basis bytes as repository file content', async () => {
    catBasisBytes.mockResolvedValue(Buffer.from([0xef, 0xbb, 0xbf, 0xe6, 0x97, 0xa5, 0xe6, 0x9c, 0xac, 0x0a]));

    const content = await provider.provideTextDocumentContent(uriWithQuery(encodeURIComponent(JSON.stringify({
      path: 'README.md'
    }))));

    expect(content).toBe('日本\n');
    expect(catBasisBytes).toHaveBeenCalledWith('README.md');
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
