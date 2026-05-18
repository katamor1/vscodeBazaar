import * as vscode from 'vscode';
import type { BazaarClient } from '../bazaar/client';
import type { BazaarTag } from '../bazaar/types';

export class BazaarTagView implements vscode.TreeDataProvider<BazaarTag>, vscode.Disposable {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<BazaarTag | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private tags: BazaarTag[] = [];
  private loaded = false;
  private loading = false;

  constructor(private readonly client: BazaarClient) {}

  getTreeItem(tag: BazaarTag): vscode.TreeItem {
    const item = new vscode.TreeItem(tag.name, vscode.TreeItemCollapsibleState.None);
    item.description = tag.revision;
    item.iconPath = new vscode.ThemeIcon('tag');
    item.contextValue = 'bazaarTag';
    return item;
  }

  getChildren(): BazaarTag[] {
    if (!this.loaded) {
      void this.ensureLoaded();
    }
    return this.tags;
  }

  async refresh(): Promise<void> {
    this.loading = true;
    try {
      this.tags = await this.client.tags();
      this.loaded = true;
      this.onDidChangeTreeDataEmitter.fire(undefined);
    } finally {
      this.loading = false;
    }
  }

  async ensureLoaded(): Promise<void> {
    if (this.loaded || this.loading) {
      return;
    }
    await this.refresh();
  }

  async create(force = false, existing?: BazaarTag): Promise<void> {
    const name = existing?.name ?? await vscode.window.showInputBox({
      title: force ? 'Bazaar タグを強制移動' : 'Bazaar タグを作成',
      prompt: 'タグ名'
    });
    if (!name) {
      return;
    }

    const revision = await vscode.window.showInputBox({
      title: force ? 'Bazaar タグを強制移動' : 'Bazaar タグを作成',
      prompt: 'リビジョン、タグ、またはリビジョン指定。空欄の場合は現在の tip を使います。'
    });
    if (revision === undefined) {
      return;
    }

    if (force) {
      const answer = await vscode.window.showWarningMessage(
        `タグ ${name} を ${revision || '現在の tip'} に移動しますか?`,
        { modal: true },
        '強制移動'
      );
      if (answer !== '強制移動') {
        return;
      }
    }

    await this.client.createTag(name, revision || undefined, force);
    await this.refresh();
  }

  async delete(tag?: BazaarTag): Promise<void> {
    const name = tag?.name ?? await vscode.window.showInputBox({
      title: 'Bazaar タグを削除',
      prompt: '削除するタグ名'
    });
    if (!name) {
      return;
    }

    const answer = await vscode.window.showWarningMessage(
      `Bazaar タグ ${name} を削除しますか?`,
      { modal: true },
      '削除'
    );
    if (answer !== '削除') {
      return;
    }

    await this.client.deleteTag(name);
    await this.refresh();
  }

  dispose(): void {
    this.onDidChangeTreeDataEmitter.dispose();
  }
}
