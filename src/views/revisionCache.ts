import type { BazaarLogOptions } from '../bazaar/client';
import type { BazaarRevision } from '../bazaar/types';
import { loadBazaarRevisionsWithFallback, type BazaarLogFallbackClient, type BazaarOutputLike } from './historyFallback';

interface CachedRevisions {
  key: string;
  revisions: BazaarRevision[];
}

export class BazaarRevisionCache {
  private cached: CachedRevisions | undefined;
  private readonly inFlight = new Map<string, Promise<BazaarRevision[]>>();
  private generation = 0;

  constructor(
    private readonly rootPath: string,
    private readonly client: BazaarLogFallbackClient,
    private readonly output?: BazaarOutputLike
  ) {}

  async get(options: BazaarLogOptions): Promise<BazaarRevision[]> {
    const key = stableOptionsKey(options);
    if (this.cached?.key === key) {
      return this.cached.revisions;
    }

    const existing = this.inFlight.get(key);
    if (existing) {
      return existing;
    }

    const generation = this.generation;
    const promise = loadBazaarRevisionsWithFallback(this.rootPath, this.client, options, this.output)
      .then((revisions) => {
        if (this.generation === generation) {
          this.cached = { key, revisions };
        }
        return revisions;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, promise);
    return promise;
  }

  invalidate(): void {
    this.generation += 1;
    this.cached = undefined;
    this.inFlight.clear();
  }
}

function stableOptionsKey(options: BazaarLogOptions): string {
  return JSON.stringify({
    includeMerged: options.includeMerged ?? false,
    limit: options.limit ?? 0,
    match: options.match ?? '',
    path: options.path ?? '',
    verbose: options.verbose ?? false
  });
}
