import * as path from 'node:path';
import * as vscode from 'vscode';
import type { BazaarClient } from '../bazaar/client';
import type { BazaarShelf } from '../bazaar/types';
import { confirmDangerousOperation } from './confirmation';

type ShelfNode = { type: 'shelf'; shelf: BazaarShelf };

export class BazaarShelveView implements vscode.TreeDataProvider<ShelfNode>, vscode.Disposable {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<ShelfNode | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private shelves: BazaarShelf[] = [];

  constructor(
    private readonly rootPath: string,
    private readonly client: BazaarClient,
    private readonly output: vscode.OutputChannel
  ) {}

  getTreeItem(node: ShelfNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      `${node.shelf.id}: ${node.shelf.message || '(no message)'}`,
      vscode.TreeItemCollapsibleState.None
    );
    item.iconPath = new vscode.ThemeIcon('archive');
    item.contextValue = 'bazaarShelf';
    item.command = {
      command: 'bazaar.shelve.preview',
      title: 'Preview Bazaar Shelf',
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
      vscode.window.showWarningMessage('Open or select a file inside the Bazaar tree first.');
      return;
    }
    const message = await this.shelfMessage('Shelve Bazaar changes');
    if (message === undefined) {
      return;
    }
    await this.client.shelve([targetPath], message);
    await this.refresh();
    vscode.commands.executeCommand('bazaar.refresh');
  }

  async createAll(): Promise<void> {
    const message = await this.shelfMessage('Shelve all Bazaar changes');
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
    const document = await vscode.workspace.openTextDocument({
      content: diff,
      language: 'diff'
    });
    await vscode.window.showTextDocument(document, { preview: true });
  }

  async apply(shelf?: BazaarShelf): Promise<void> {
    if (!shelf || !(await this.confirmShelf('Apply Bazaar shelf', shelf))) {
      return;
    }
    await this.client.unshelveApply(shelf.id);
    await this.refresh();
    vscode.commands.executeCommand('bazaar.refresh');
  }

  async keep(shelf?: BazaarShelf): Promise<void> {
    if (!shelf || !(await this.confirmShelf('Apply and keep Bazaar shelf', shelf))) {
      return;
    }
    await this.client.unshelveKeep(shelf.id);
    await this.refresh();
    vscode.commands.executeCommand('bazaar.refresh');
  }

  async delete(shelf?: BazaarShelf): Promise<void> {
    if (!shelf || !(await this.confirmShelf('Delete Bazaar shelf', shelf))) {
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
      prompt: 'Shelf message',
      value: ''
    });
    return message === undefined ? undefined : message.trim();
  }

  private async confirmShelf(label: string, shelf: BazaarShelf): Promise<boolean> {
    return confirmDangerousOperation({
      id: `shelf-${shelf.id}`,
      label,
      target: `${shelf.id}: ${shelf.message || '(no message)'}`
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
