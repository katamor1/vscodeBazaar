import * as path from 'node:path';
import * as vscode from 'vscode';
import type { BazaarClient } from '../bazaar/client';

interface OriginalQuery {
  path: string;
}

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
    const query = encodeURIComponent(JSON.stringify({ path: relativePath } satisfies OriginalQuery));
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
    const relativePath = this.readQuery(uri).path;
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

  private readQuery(uri: vscode.Uri): OriginalQuery {
    const decoded = decodeURIComponent(uri.query);
    const parsed = JSON.parse(decoded) as OriginalQuery;
    if (!parsed.path) {
      throw new Error('元 Bazaar ドキュメント URI にパスがありません。');
    }
    return parsed;
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
