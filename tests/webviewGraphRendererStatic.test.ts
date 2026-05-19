import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('webview graph rendering', () => {
  it('does not keep a separate graph SVG layout inside EXPLORE', () => {
    const exploreView = readFileSync(join(root, 'src/views/exploreView.ts'), 'utf8');
    const graphView = readFileSync(join(root, 'src/views/graphView.ts'), 'utf8');

    expect(exploreView).toContain('model.graphHtml');
    expect(graphView).toContain('payload.graphHtml');
    expect(exploreView).not.toContain('const rowHeight = 34');
    expect(exploreView).not.toContain('const columnWidth = 46');
  });
});
