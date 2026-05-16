import * as path from 'node:path';
import * as vscode from 'vscode';
import type { BazaarClient } from '../bazaar/client';
import type { BazaarShelf } from '../bazaar/types';
import type { BazaarGeneratedDocumentProvider } from '../scm/generatedDocumentProvider';
import { confirmDangerousOperation } from './confirmation';

type ShelfNode = { type: 'shelf'; shelf: BazaarShelf };

export class BazaarShelveView implements vscode.TreeDataProvider<ShelfNode>, vscode.Disposable {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<ShelfNode | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private shelves: BazaarShelf[] = [];

  constructor(
    private readonly rootPath: string,
    private readonly client: BazaarClient,
    private readonly generatedProvider: BazaarGeneratedDocumentProvider,
    private readonly output: vscode.OutputChannel
  ) {}

  getTreeItem(node: ShelfNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      `${node.shelf.id}: ${node.shelf.message || '(メッセージなし)'}`,
      vscode.TreeItemCollapsibleState.None
    );
    item.iconPath = new vscode.ThemeIcon('archive');
    item.contextValue = 'bazaarShelf';
    item.command = {
      command: 'bazaar.shelve.preview',
      title: 'Bazaar シェルブをプレビュー',
      arguments: [node.shelf]
    };
    return item;
  }

  getChildren(): ShelfNode[] {
    return this.shelves.map((shelf) => ({ type: 'shelf', shelf }));
  }

  async refresh(): Promise<void> {
    this.shelves = await this.client.shelves();
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  async create(resource?: { resourceUri?: vscode.Uri }): Promise<void> {
    const targetPath = this.pathFromResource(resource);
    if (!targetPath) {
      vscode.window.showWarningMessage('先に Bazaar ツリー内のファイルを開くか選択してください。');
      return;
    }
    const message = await this.shelfMessage('Bazaar 変更をシェルブ');
    if (message === undefined) {
      return;
    }
    await this.client.shelve([targetPath], message);
    await this.refresh();
    vscode.commands.executeCommand('bazaar.refresh');
  }

  async createAll(): Promise<void> {
    const message = await this.shelfMessage('すべての Bazaar 変更をシェルブ');
    if (message === undefined) {
      return;
    }
    await this.client.shelveAll(message);
    await this.refresh();
    vscode.commands.executeCommand('bazaar.refresh');
  }

  async preview(shelf?: BazaarShelf): Promise<void> {
    if (!shelf) {
      return;
    }
    const diff = await this.client.unshelvePreview(shelf.id);
    const document = await this.generatedProvider.openDocument(`Bazaar シェルブ ${shelf.id} プレビュー`, diff, 'diff');
    await vscode.window.showTextDocument(document, { preview: true });
  }

  async apply(shelf?: BazaarShelf): Promise<void> {
    if (!shelf || !(await this.confirmShelf('Bazaar シェルブを適用', shelf))) {
      return;
    }
    await this.client.unshelveApply(shelf.id);
    await this.refresh();
    vscode.commands.executeCommand('bazaar.refresh');
  }

  async keep(shelf?: BazaarShelf): Promise<void> {
    if (!shelf || !(await this.confirmShelf('Bazaar シェルブを適用して保持', shelf))) {
      return;
    }
    await this.client.unshelveKeep(shelf.id);
    await this.refresh();
    vscode.commands.executeCommand('bazaar.refresh');
  }

  async delete(shelf?: BazaarShelf): Promise<void> {
    if (!shelf || !(await this.confirmShelf('Bazaar シェルブを削除', shelf))) {
      return;
    }
    await this.client.unshelveDelete(shelf.id);
    await this.refresh();
  }

  dispose(): void {
    this.onDidChangeTreeDataEmitter.dispose();
  }

  private async shelfMessage(title: string): Promise<string | undefined> {
    const message = await vscode.window.showInputBox({
      title,
      prompt: 'シェルブメッセージ',
      value: ''
    });
    return message === undefined ? undefined : message.trim();
  }

  private async confirmShelf(label: string, shelf: BazaarShelf): Promise<boolean> {
    return confirmDangerousOperation({
      id: `shelf-${shelf.id}`,
      label,
      target: `${shelf.id}: ${shelf.message || '(メッセージなし)'}`
    });
  }

  private pathFromResource(resource?: { resourceUri?: vscode.Uri }): string | undefined {
    const uri = resource?.resourceUri ?? vscode.window.activeTextEditor?.document.uri;
    if (!uri || uri.scheme !== 'file') {
      return undefined;
    }
    const relative = path.relative(this.rootPath, uri.fsPath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      return undefined;
    }
    return relative.replace(/\\/g, '/');
  }
}
