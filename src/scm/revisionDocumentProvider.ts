import * as vscode from 'vscode';
import type { BazaarClient } from '../bazaar/client';

interface RevisionQuery {
  path: string;
  revision: string;
  empty?: boolean;
}

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
    if (query.empty) {
      return '';
    }

    try {
      return await this.client.catAtRevision(query.revision, query.path);
    } catch (error) {
      this.output.appendLine(`Unable to read Bazaar revision ${query.revision} for ${query.path}: ${formatError(error)}`);
      return '';
    }
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }

  private createUri(query: RevisionQuery): vscode.Uri {
    const encoded = encodeURIComponent(JSON.stringify(query));
    return vscode.Uri.from({
      scheme: BazaarRevisionDocumentProvider.scheme,
      path: `/${query.path.replace(/\\/g, '/')}`,
      query: encoded
    });
  }

  private readQuery(uri: vscode.Uri): RevisionQuery {
    const parsed = JSON.parse(decodeURIComponent(uri.query)) as RevisionQuery;
    if (!parsed.path || !parsed.revision) {
      throw new Error('Bazaar revision document URI is missing path or revision.');
    }
    return parsed;
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
