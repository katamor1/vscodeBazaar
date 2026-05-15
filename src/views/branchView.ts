import * as vscode from 'vscode';
import type { BazaarClient } from '../bazaar/client';
import type { BazaarBranch } from '../bazaar/types';

export class BazaarBranchView implements vscode.TreeDataProvider<BazaarBranch>, vscode.Disposable {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<BazaarBranch | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private branches: BazaarBranch[] = [];

  constructor(private readonly client: BazaarClient) {}

  getTreeItem(branch: BazaarBranch): vscode.TreeItem {
    const item = new vscode.TreeItem(branch.name, vscode.TreeItemCollapsibleState.None);
    item.description = branch.current ? 'current' : branch.path;
    item.iconPath = new vscode.ThemeIcon(branch.current ? 'check' : 'git-branch');
    item.contextValue = branch.current ? 'bazaarBranchCurrent' : 'bazaarBranch';
    item.command = {
      command: 'bazaar.branch.switch',
      title: 'Switch Bazaar Branch',
      arguments: [branch]
    };
    return item;
  }

  getChildren(): BazaarBranch[] {
    return this.branches;
  }

  async refresh(): Promise<void> {
    const info = await this.client.info();
    this.branches = await this.client.branches(info.repository ?? '.');
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  async create(): Promise<void> {
    const fromLocation = await vscode.window.showInputBox({
      title: 'Create Bazaar Branch',
      prompt: 'Source branch/location',
      value: '.'
    });
    if (!fromLocation) {
      return;
    }

    const toLocation = await vscode.window.showInputBox({
      title: 'Create Bazaar Branch',
      prompt: 'Destination branch/location'
    });
    if (!toLocation) {
      return;
    }

    await this.client.createBranch(fromLocation, toLocation);
    await this.refresh();
  }

  async switch(branch?: BazaarBranch, force = false): Promise<void> {
    const target = branch?.path ?? await vscode.window.showInputBox({
      title: force ? 'Force Switch Bazaar Branch' : 'Switch Bazaar Branch',
      prompt: 'Branch/location to switch to'
    });
    if (!target) {
      return;
    }

    if (force) {
      const answer = await vscode.window.showWarningMessage(
        `Force switch Bazaar branch to ${target}? Local commits can be lost.`,
        { modal: true },
        'Force Switch'
      );
      if (answer !== 'Force Switch') {
        return;
      }
    }

    await this.client.switchBranch(target, force);
    await this.refresh();
  }

  async remove(branch?: BazaarBranch, force = false): Promise<void> {
    const target = branch?.path ?? await vscode.window.showInputBox({
      title: force ? 'Force Remove Bazaar Branch' : 'Remove Bazaar Branch',
      prompt: 'Branch/location to remove'
    });
    if (!target) {
      return;
    }

    const answer = await vscode.window.showWarningMessage(
      `${force ? 'Force remove' : 'Remove'} Bazaar branch ${target}?`,
      { modal: true },
      force ? 'Force Remove' : 'Remove'
    );
    if (answer !== (force ? 'Force Remove' : 'Remove')) {
      return;
    }

    await this.client.removeBranch(target, force);
    await this.refresh();
  }

  dispose(): void {
    this.onDidChangeTreeDataEmitter.dispose();
  }
}
