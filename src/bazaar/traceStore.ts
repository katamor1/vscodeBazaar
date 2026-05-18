import type { BazaarCommandTrace } from './client';

export class BazaarTraceStore {
  private readonly entries: BazaarCommandTrace[] = [];

  constructor(
    private readonly maxEntries: number,
    private readonly maxStoredOutputChars: number
  ) {}

  add(trace: BazaarCommandTrace): void {
    if (this.maxEntries <= 0) {
      this.entries.splice(0);
      return;
    }

    this.entries.unshift({
      ...trace,
      result: {
        ...trace.result,
        stdout: limitStoredText(trace.result.stdout, this.maxStoredOutputChars),
        stderr: limitStoredText(trace.result.stderr, this.maxStoredOutputChars)
      }
    });
    this.entries.splice(this.maxEntries);
  }

  latest(): BazaarCommandTrace | undefined {
    return this.entries[0];
  }

  clear(): void {
    this.entries.splice(0);
  }
}

function limitStoredText(value: string, maxChars: number): string {
  if (maxChars <= 0 || value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars)}\n... truncated in memory; original was ${value.length} chars`;
}
