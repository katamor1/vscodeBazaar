import * as path from 'node:path';
import * as vscode from 'vscode';
import type { BazaarClient } from '../bazaar/client';
import type { BazaarBranch } from '../bazaar/types';
import {
  type DiscoveredBranches,
  includeCheckoutRootBranch,
  mergeDiscoveredBranches,
  resolveBranchDiscoveryLocations
} from './branchDiscovery';
import {
  resolveBranchCreateTarget,
  validateBranchFolderName
} from './branchCreateTarget';
import { resolveBranchSwitchAction } from './branchSwitchTarget';

export class BazaarBranchView implements vscode.TreeDataProvider<BazaarBranch>, vscode.Disposable {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<BazaarBranch | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private branches: BazaarBranch[] = [];
  private readonly extraDiscoveryLocations = new Set<string>();

  constructor(
    private readonly rootPath: string,
    private readonly client: BazaarClient,
    private readonly output?: vscode.OutputChannel,
    private readonly onDidSwitchBranch?: () => Promise<void> | void
  ) {}

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
    const locations = resolveBranchDiscoveryLocations(this.rootPath, info, [...this.extraDiscoveryLocations]);
    const discoveredBranches: DiscoveredBranches[] = [];
    const failures: string[] = [];
    for (const location of locations) {
      try {
        discoveredBranches.push({
          location,
          branches: await this.client.branches(location)
        });
      } catch (error) {
        failures.push(`${location}: ${formatError(error)}`);
      }
    }
    for (const failure of failures) {
      this.output?.appendLine(`Unable to load Bazaar branches from ${failure}`);
    }
    if (discoveredBranches.length === 0 && failures.length > 0) {
      throw new Error('Unable to load Bazaar branches from any discovered branch location.');
    }
    this.branches = includeCheckoutRootBranch(
      this.rootPath,
      info,
      mergeDiscoveredBranches(this.rootPath, discoveredBranches)
    );
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
      prompt: 'Branch folder name. The branch will be created outside the current workspace.',
      validateInput: validateBranchFolderName
    });
    if (!toLocation) {
      return;
    }

    const target = resolveBranchCreateTarget(this.rootPath, await this.client.info(), toLocation);
    if ('warning' in target) {
      vscode.window.showWarningMessage(target.warning);
      return;
    }

    const answer = await vscode.window.showWarningMessage(
      `Create Bazaar branch ${target.branchName} at ${target.toLocation}?`,
      { modal: true },
      'Create Branch'
    );
    if (answer !== 'Create Branch') {
      return;
    }

    await this.client.createBranch(fromLocation, target.toLocation);
    this.extraDiscoveryLocations.add(path.win32.dirname(target.toLocation));
    await this.refresh();
    vscode.window.showInformationMessage(`Created Bazaar branch ${target.branchName} at ${target.toLocation}.`);
  }

  async switch(branch?: BazaarBranch, force = false): Promise<void> {
    const target = branch?.path ?? await vscode.window.showInputBox({
      title: force ? 'Force Switch Bazaar Branch' : 'Switch Bazaar Branch',
      prompt: 'Branch/location to switch to'
    });
    if (!target) {
      return;
    }

    const action = await resolveBranchSwitchAction(this.rootPath, target, force);
    if (action.kind === 'openWorktree') {
      await this.openWorktreeBranch(action.targetPath);
      return;
    }

    if (force) {
      const answer = await vscode.window.showWarningMessage(
        `Force switch Bazaar branch to ${action.target}? Local commits can be lost.`,
        { modal: true },
        'Force Switch'
      );
      if (answer !== 'Force Switch') {
        return;
      }
    }

    await this.client.switchBranch(action.target, action.force);
    await this.refreshAfterSwitch();
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

  private async refreshAfterSwitch(): Promise<void> {
    const refresh = this.onDidSwitchBranch ?? (() => this.refresh());
    try {
      await refresh();
    } catch (error) {
      this.output?.appendLine(`Bazaar branch switch refresh failed: ${formatError(error)}`);
    }
  }

  private async openWorktreeBranch(targetPath: string): Promise<void> {
    const answer = await vscode.window.showWarningMessage(
      `この VS Code ウィンドウを ${targetPath} に移動します。現在の作業ツリーには bzr switch を実行しません。`,
      { modal: true },
      'Open Worktree'
    );
    if (answer !== 'Open Worktree') {
      return;
    }

    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(targetPath), false);
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
