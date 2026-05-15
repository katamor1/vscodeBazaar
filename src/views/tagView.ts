import * as vscode from 'vscode';
import type { BazaarClient } from '../bazaar/client';
import type { BazaarTag } from '../bazaar/types';

export class BazaarTagView implements vscode.TreeDataProvider<BazaarTag>, vscode.Disposable {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<BazaarTag | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private tags: BazaarTag[] = [];

  constructor(private readonly client: BazaarClient) {}

  getTreeItem(tag: BazaarTag): vscode.TreeItem {
    const item = new vscode.TreeItem(tag.name, vscode.TreeItemCollapsibleState.None);
    item.description = tag.revision;
    item.iconPath = new vscode.ThemeIcon('tag');
    item.contextValue = 'bazaarTag';
    return item;
  }

  getChildren(): BazaarTag[] {
    return this.tags;
  }

  async refresh(): Promise<void> {
    this.tags = await this.client.tags();
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  async create(force = false, existing?: BazaarTag): Promise<void> {
    const name = existing?.name ?? await vscode.window.showInputBox({
      title: force ? 'Force Move Bazaar Tag' : 'Create Bazaar Tag',
      prompt: 'Tag name'
    });
    if (!name) {
      return;
    }

    const revision = await vscode.window.showInputBox({
      title: force ? 'Force Move Bazaar Tag' : 'Create Bazaar Tag',
      prompt: 'Revision, tag, or revision spec. Leave empty for current tip.'
    });
    if (revision === undefined) {
      return;
    }

    if (force) {
      const answer = await vscode.window.showWarningMessage(
        `Move tag ${name} to ${revision || 'current tip'}?`,
        { modal: true },
        'Force Move'
      );
      if (answer !== 'Force Move') {
        return;
      }
    }

    await this.client.createTag(name, revision || undefined, force);
    await this.refresh();
  }

  async delete(tag?: BazaarTag): Promise<void> {
    const name = tag?.name ?? await vscode.window.showInputBox({
      title: 'Delete Bazaar Tag',
      prompt: 'Tag name to delete'
    });
    if (!name) {
      return;
    }

    const answer = await vscode.window.showWarningMessage(
      `Delete Bazaar tag ${name}?`,
      { modal: true },
      'Delete'
    );
    if (answer !== 'Delete') {
      return;
    }

    await this.client.deleteTag(name);
    await this.refresh();
  }

  dispose(): void {
    this.onDidChangeTreeDataEmitter.dispose();
  }
}
