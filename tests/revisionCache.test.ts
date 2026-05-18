import { describe, expect, it, vi } from 'vitest';
import { BazaarRevisionCache } from '../src/views/revisionCache';
import type { BazaarRevision } from '../src/bazaar/types';

const revision: BazaarRevision = {
  revno: '1',
  revisionId: 'rev-1',
  parentIds: [],
  tags: [],
  committer: 'Alice',
  branchNick: 'main',
  timestamp: 'today',
  message: 'initial',
  depth: 0
};

describe('BazaarRevisionCache', () => {
  it('reuses cached and in-flight log loads for identical options', async () => {
    let resolveLog: (value: BazaarRevision[]) => void = () => undefined;
    const logPromise = new Promise<BazaarRevision[]>((resolve) => {
      resolveLog = resolve;
    });
    const client = {
      log: vi.fn(() => logPromise),
      logAt: vi.fn()
    };
    const cache = new BazaarRevisionCache('C:/repo', client);

    const first = cache.get({ limit: 10, includeMerged: true });
    const second = cache.get({ includeMerged: true, limit: 10 });
    resolveLog([revision]);

    await expect(first).resolves.toEqual([revision]);
    await expect(second).resolves.toEqual([revision]);
    await expect(cache.get({ limit: 10, includeMerged: true })).resolves.toEqual([revision]);
    expect(client.log).toHaveBeenCalledTimes(1);
  });

  it('invalidates cached revisions', async () => {
    const client = {
      log: vi.fn()
        .mockResolvedValueOnce([revision])
        .mockResolvedValueOnce([{ ...revision, revno: '2', revisionId: 'rev-2' }]),
      logAt: vi.fn()
    };
    const cache = new BazaarRevisionCache('C:/repo', client);

    await expect(cache.get({ limit: 10 })).resolves.toEqual([revision]);
    cache.invalidate();
    await expect(cache.get({ limit: 10 })).resolves.toEqual([{ ...revision, revno: '2', revisionId: 'rev-2' }]);
    expect(client.log).toHaveBeenCalledTimes(2);
  });

  it('does not cache stale in-flight loads after invalidation', async () => {
    const first = deferred<BazaarRevision[]>();
    const second = deferred<BazaarRevision[]>();
    const freshRevision = { ...revision, revno: '2', revisionId: 'rev-2' };
    const client = {
      log: vi.fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise),
      logAt: vi.fn()
    };
    const cache = new BazaarRevisionCache('C:/repo', client);

    const staleLoad = cache.get({ limit: 10 });
    cache.invalidate();
    const freshLoad = cache.get({ limit: 10 });

    second.resolve([freshRevision]);
    await expect(freshLoad).resolves.toEqual([freshRevision]);
    first.resolve([revision]);
    await expect(staleLoad).resolves.toEqual([revision]);

    await expect(cache.get({ limit: 10 })).resolves.toEqual([freshRevision]);
    expect(client.log).toHaveBeenCalledTimes(2);
  });
});

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}
