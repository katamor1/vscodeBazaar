import * as vscode from 'vscode';
import type { BazaarClient } from '../bazaar/client';
import { decodeRepositoryFileContent } from '../bazaar/outputEncoding';
import {
  type RevisionDocumentQuery,
  decodeRevisionDocumentQuery,
  encodeRevisionDocumentQuery
} from './revisionDocumentQuery';

export class BazaarRevisionDocumentProvider implements vscode.TextDocumentContentProvider {
  static readonly scheme = 'bazaar-revision';

  private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.onDidChangeEmitter.event;

  constructor(
    private readonly client: BazaarClient,
    private readonly output: vscode.OutputChannel
  ) {}

  createUriForPath(relativePath: string, revision: string): vscode.Uri {
    return this.createUri({ path: relativePath, revision });
  }

  createEmptyUri(relativePath: string, revision: string): vscode.Uri {
    return this.createUri({ path: relativePath, revision, empty: true });
  }

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const query = this.readQuery(uri);
    if (!query) {
      this.output.appendLine(`不正な Bazaar リビジョンドキュメント URI を無視します: ${uri.toString()}`);
      return '';
    }
    if (query.empty) {
      return '';
    }

    try {
      return decodeRepositoryFileContent(
        await this.client.catAtRevisionBytes(query.revision, query.path),
        { preferredEncoding: repositoryFileEncoding() }
      );
    } catch (error) {
      this.output.appendLine(`${query.path} の Bazaar リビジョン ${query.revision} を読み込めませんでした: ${formatError(error)}`);
      return '';
    }
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }

  private createUri(query: RevisionDocumentQuery): vscode.Uri {
    const encoded = encodeRevisionDocumentQuery(query);
    return vscode.Uri.from({
      scheme: BazaarRevisionDocumentProvider.scheme,
      path: `/${query.path.replace(/\\/g, '/')}`,
      query: encoded
    });
  }

  private readQuery(uri: vscode.Uri): RevisionDocumentQuery | undefined {
    return decodeRevisionDocumentQuery(uri.query);
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function repositoryFileEncoding(): string | undefined {
  return vscode.workspace.getConfiguration('files').get<string>('encoding');
}
