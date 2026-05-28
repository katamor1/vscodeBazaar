import * as vscode from 'vscode';
import {
  type GeneratedDocumentLanguage,
  generatedDocumentExtension,
  generatedDocumentPathLabel
} from './generatedDocument';

interface GeneratedDocument {
  content: string;
}

export class BazaarGeneratedDocumentProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
  static readonly scheme = 'bazaar-generated';

  private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.onDidChangeEmitter.event;
  private readonly documents = new Map<string, GeneratedDocument>();
  private nextId = 1;

  createUri(title: string, content: string, language: GeneratedDocumentLanguage): vscode.Uri {
    const id = String(this.nextId++);
    const label = generatedDocumentPathLabel(title);
    const extension = generatedDocumentExtension(language);
    const uri = vscode.Uri.from({
      scheme: BazaarGeneratedDocumentProvider.scheme,
      path: `/${label}.${extension}`,
      query: id
    });
    this.documents.set(uri.toString(), { content });
    return uri;
  }

  async openDocument(title: string, content: string, language: GeneratedDocumentLanguage): Promise<vscode.TextDocument> {
    return vscode.workspace.openTextDocument(this.createUri(title, content, language));
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.documents.get(uri.toString())?.content ?? '';
  }

  deleteUri(uri: vscode.Uri): void {
    this.documents.delete(uri.toString());
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
    this.documents.clear();
  }
}
