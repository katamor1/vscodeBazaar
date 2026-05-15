import * as path from 'node:path';
import * as vscode from 'vscode';
import type { BazaarClient } from '../bazaar/client';
import type { BazaarAnnotation } from '../bazaar/types';

interface CachedAnnotations {
  documentVersion: number;
  annotations: BazaarAnnotation[];
}

export class BazaarBlameController implements vscode.Disposable, vscode.HoverProvider {
  private readonly decorationType = vscode.window.createTextEditorDecorationType({
    after: {
      margin: '0 0 0 2em',
      color: new vscode.ThemeColor('descriptionForeground')
    }
  });
  private enabled = false;
  private readonly cache = new Map<string, CachedAnnotations>();

  constructor(
    private readonly rootPath: string,
    private readonly client: BazaarClient,
    private readonly output: vscode.OutputChannel
  ) {}

  async toggle(): Promise<void> {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      for (const editor of vscode.window.visibleTextEditors) {
        editor.setDecorations(this.decorationType, []);
      }
      return;
    }

    await this.update(vscode.window.activeTextEditor);
  }

  async refresh(): Promise<void> {
    this.cache.clear();
    await this.update(vscode.window.activeTextEditor);
  }

  async update(editor?: vscode.TextEditor): Promise<void> {
    if (!this.enabled || !editor || editor.document.uri.scheme !== 'file') {
      return;
    }

    const relativePath = path.relative(this.rootPath, editor.document.uri.fsPath).replace(/\\/g, '/');
    if (relativePath.startsWith('..')) {
      return;
    }

    const annotations = await this.annotationsFor(editor.document, relativePath);
    const decorations = annotations.map((annotation) => ({
      range: new vscode.Range(annotation.line - 1, Number.MAX_SAFE_INTEGER, annotation.line - 1, Number.MAX_SAFE_INTEGER),
      renderOptions: {
        after: {
          contentText: ` ${this.formatAnnotation(annotation)}`
        }
      }
    }));
    editor.setDecorations(this.decorationType, decorations);
  }

  async provideHover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined> {
    if (!this.enabled || document.uri.scheme !== 'file') {
      return undefined;
    }

    const relativePath = this.relativePath(document.uri);
    if (!relativePath) {
      return undefined;
    }

    const annotation = (await this.annotationsFor(document, relativePath))[position.line];
    if (!annotation) {
      return undefined;
    }

    const markdown = new vscode.MarkdownString([
      `Bazaar rev ${annotation.revno}`,
      `Author: ${annotation.author}`,
      annotation.date ? `Date: ${annotation.date}` : undefined,
      '',
      annotation.text
    ].filter(Boolean).join('\n\n'));
    return new vscode.Hover(markdown);
  }

  async showCommit(): Promise<void> {
    const annotation = await this.annotationAtActiveLine();
    if (!annotation) {
      return;
    }
    const revision = await this.client.logRevision(annotation.revno);
    if (revision) {
      await vscode.commands.executeCommand('bazaar.history.showCommit', revision);
      return;
    }

    const document = await vscode.workspace.openTextDocument({
      content: `revno: ${annotation.revno}\nauthor: ${annotation.author}\ndate: ${annotation.date ?? ''}\n\n${annotation.text}`,
      language: 'text'
    });
    await vscode.window.showTextDocument(document, { preview: true });
  }

  async showDiff(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const annotation = await this.annotationAtActiveLine();
    if (!editor || !annotation) {
      return;
    }
    const relativePath = this.relativePath(editor.document.uri);
    if (!relativePath) {
      return;
    }
    const diff = await this.client.diffChange(annotation.revno, relativePath);
    this.output.appendLine(`bzr diff -c ${annotation.revno} ${relativePath}`);
    this.output.appendLine(diff.trimEnd());
    this.output.show();
  }

  dispose(): void {
    this.decorationType.dispose();
  }

  private async annotationAtActiveLine(): Promise<BazaarAnnotation | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme !== 'file') {
      return undefined;
    }
    const relativePath = this.relativePath(editor.document.uri);
    if (!relativePath) {
      return undefined;
    }
    return (await this.annotationsFor(editor.document, relativePath))[editor.selection.active.line];
  }

  private async annotationsFor(document: vscode.TextDocument, relativePath: string): Promise<BazaarAnnotation[]> {
    const cacheKey = document.uri.toString();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.documentVersion === document.version) {
      return cached.annotations;
    }

    const annotations = await this.client.annotate(relativePath);
    this.cache.set(cacheKey, { documentVersion: document.version, annotations });
    return annotations;
  }

  private relativePath(uri: vscode.Uri): string | undefined {
    const relativePath = path.relative(this.rootPath, uri.fsPath).replace(/\\/g, '/');
    if (relativePath.startsWith('..')) {
      return undefined;
    }
    return relativePath;
  }

  private formatAnnotation(annotation: BazaarAnnotation): string {
    const format = vscode.workspace.getConfiguration('bazaar').get<string>('blame.enabledFormat', 'revAuthorDate');
    if (format === 'revAuthor') {
      return `${annotation.revno} ${annotation.author}`;
    }
    return [annotation.revno, annotation.author, annotation.date].filter(Boolean).join(' ');
  }
}
