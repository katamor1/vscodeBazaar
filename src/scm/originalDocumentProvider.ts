import * as path from 'node:path';
import * as vscode from 'vscode';
import type { BazaarClient } from '../bazaar/client';
import {
  type OriginalDocumentQuery,
  decodeOriginalDocumentQuery,
  encodeOriginalDocumentQuery
} from './originalDocumentQuery';

export class BazaarOriginalDocumentProvider implements vscode.TextDocumentContentProvider {
  static readonly scheme = 'bazaar-original';

  private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.onDidChangeEmitter.event;

  constructor(
    private readonly rootPath: string,
    private readonly client: BazaarClient,
    private readonly output: vscode.OutputChannel
  ) {}

  createUriForPath(relativePath: string): vscode.Uri {
    const query = encodeOriginalDocumentQuery({ path: relativePath });
    return vscode.Uri.from({
      scheme: BazaarOriginalDocumentProvider.scheme,
      path: `/${relativePath.replace(/\\/g, '/')}`,
      query
    });
  }

  pathFromWorkspaceUri(uri: vscode.Uri): string | undefined {
    if (uri.scheme !== 'file') {
      return undefined;
    }

    const relativePath = path.relative(this.rootPath, uri.fsPath);
    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return undefined;
    }

    return relativePath.replace(/\\/g, '/');
  }

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const query = this.readQuery(uri);
    if (!query) {
      this.output.appendLine(`不正な Bazaar 元ドキュメント URI を無視します: ${uri.toString()}`);
      return '';
    }
    const relativePath = query.path;
    try {
      return await this.client.catBasis(relativePath);
    } catch (error) {
      this.output.appendLine(`${relativePath} の Bazaar basis を読み込めませんでした: ${formatError(error)}`);
      return '';
    }
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }

  private readQuery(uri: vscode.Uri): OriginalDocumentQuery | undefined {
    return decodeOriginalDocumentQuery(uri.query);
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
