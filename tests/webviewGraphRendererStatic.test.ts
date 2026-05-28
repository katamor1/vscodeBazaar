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

  it('adds a content security policy to every script-enabled webview', () => {
    const sources = [
      'src/views/exploreView.ts',
      'src/views/graphView.ts',
      'src/views/historyView.ts'
    ].map((file) => readFileSync(join(root, file), 'utf8'));
    const securityHelper = readFileSync(join(root, 'src/views/webviewSecurity.ts'), 'utf8');

    for (const source of sources) {
      expect(source).toContain('Content-Security-Policy');
      expect(source).toContain('webviewContentSecurityPolicy');
      expect(source).toContain('<style nonce="${nonce}">');
      expect(source).toContain('nonce="${nonce}"');
    }
    expect(securityHelper).toContain("default-src 'none'");
    expect(securityHelper).toContain('img-src');
    expect(securityHelper).toContain('script-src');
    expect(securityHelper).toContain('style-src');
    expect(securityHelper).toContain('nonce-');
    expect(securityHelper).not.toContain('unsafe-inline');
  });
});
