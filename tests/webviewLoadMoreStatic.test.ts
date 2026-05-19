import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('webview load-more behavior', () => {
  it('uses sentinel placeholders instead of scroll percentage thresholds', () => {
    const sources = [
      'src/views/graphView.ts',
      'src/views/historyView.ts',
      'src/views/exploreView.ts'
    ].map((file) => readFileSync(join(root, file), 'utf8')).join('\n');

    expect(sources).toContain('IntersectionObserver');
    expect(sources).toContain('load-more-sentinel');
    expect(sources).not.toContain('scrollTop');
    expect(sources).not.toContain('0.95');
    expect(sources).not.toContain('shouldAutoLoadMore');
  });
});
