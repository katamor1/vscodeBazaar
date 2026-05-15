import type { BazaarChange } from './types';

export class IncludedSet {
  private readonly included = new Map<string, string>();

  include(change: BazaarChange): void {
    this.included.set(keyFor(change.path), change.path);
  }

  includeAll(changes: readonly BazaarChange[]): void {
    for (const change of changes) {
      this.include(change);
    }
  }

  uninclude(change: BazaarChange): void {
    this.included.delete(keyFor(change.path));
  }

  has(change: BazaarChange): boolean {
    return this.included.has(keyFor(change.path));
  }

  clear(): void {
    this.included.clear();
  }

  prune(changes: readonly BazaarChange[]): void {
    const liveKeys = new Set(changes.map((change) => keyFor(change.path)));
    for (const key of this.included.keys()) {
      if (!liveKeys.has(key)) {
        this.included.delete(key);
      }
    }
  }

  paths(): string[] {
    return Array.from(this.included.values());
  }

  getIncludedChanges(changes: readonly BazaarChange[]): BazaarChange[] {
    return changes.filter((change) => this.has(change));
  }

  getRemainingChanges(changes: readonly BazaarChange[]): BazaarChange[] {
    return changes.filter((change) => !this.has(change));
  }
}

function keyFor(pathText: string): string {
  return pathText.replace(/\\/g, '/');
}
