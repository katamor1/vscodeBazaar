import * as path from 'node:path';
import * as vscode from 'vscode';
import { discoverSiblingBranchMetadata, metadataToBazaarBranch } from '../bazaar/branchMetadata';
import type { BazaarClient } from '../bazaar/client';
import type { BazaarBranch } from '../bazaar/types';
import {
  type DiscoveredBranches,
  includeCheckoutRootBranch,
  includeLocalBranches,
  includeRelatedBranches,
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
    item.description = branch.current ? '現在' : branch.path;
    item.iconPath = new vscode.ThemeIcon(branch.current ? 'check' : 'git-branch');
    item.contextValue = branch.current ? 'bazaarBranchCurrent' : 'bazaarBranch';
    item.command = {
      command: 'bazaar.branch.switch',
      title: 'Bazaar ブランチを切り替え',
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
      this.output?.appendLine(`${failure} から Bazaar ブランチを読み込めませんでした`);
    }
    if (discoveredBranches.length === 0 && failures.length > 0) {
      throw new Error('検出したどのブランチ場所からも Bazaar ブランチを読み込めませんでした。');
    }
    const localBranches = await this.discoverLocalBranches();
    this.branches = includeLocalBranches(includeRelatedBranches(
      this.rootPath,
      info,
      includeCheckoutRootBranch(
        this.rootPath,
        info,
        mergeDiscoveredBranches(this.rootPath, discoveredBranches)
      )
    ), localBranches);
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  async create(): Promise<void> {
    const fromLocation = await vscode.window.showInputBox({
      title: 'Bazaar ブランチを作成',
      prompt: '作成元のブランチまたは場所',
      value: '.'
    });
    if (!fromLocation) {
      return;
    }

    const toLocation = await vscode.window.showInputBox({
      title: 'Bazaar ブランチを作成',
      prompt: 'ブランチフォルダー名。ブランチは現在のワークスペース外に作成されます。',
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
      `Bazaar ブランチ ${target.branchName} を ${target.toLocation} に作成しますか?`,
      { modal: true },
      'ブランチを作成'
    );
    if (answer !== 'ブランチを作成') {
      return;
    }

    await this.client.createBranch(fromLocation, target.toLocation);
    this.extraDiscoveryLocations.add(path.win32.dirname(target.toLocation));
    await this.refresh();
    vscode.window.showInformationMessage(`Bazaar ブランチ ${target.branchName} を ${target.toLocation} に作成しました。`);
  }

  async switch(branch?: BazaarBranch, force = false): Promise<void> {
    const target = branch?.path ?? await vscode.window.showInputBox({
      title: force ? 'Bazaar ブランチを強制切替' : 'Bazaar ブランチを切り替え',
      prompt: '切替先のブランチまたは場所'
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
        `Bazaar ブランチを ${action.target} に強制切替しますか? ローカルコミットが失われる可能性があります。`,
        { modal: true },
        '強制切替'
      );
      if (answer !== '強制切替') {
        return;
      }
    }

    await this.client.switchBranch(action.target, action.force);
    await this.refreshAfterSwitch();
  }

  async remove(branch?: BazaarBranch, force = false): Promise<void> {
    const target = branch?.path ?? await vscode.window.showInputBox({
      title: force ? 'Bazaar ブランチを強制削除' : 'Bazaar ブランチを削除',
      prompt: '削除するブランチまたは場所'
    });
    if (!target) {
      return;
    }

    const answer = await vscode.window.showWarningMessage(
      `Bazaar ブランチ ${target} を${force ? '強制削除' : '削除'}しますか?`,
      { modal: true },
      force ? '強制削除' : '削除'
    );
    if (answer !== (force ? '強制削除' : '削除')) {
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
      this.output?.appendLine(`Bazaar ブランチ切替後の更新に失敗しました: ${formatError(error)}`);
    }
  }

  private async discoverLocalBranches(): Promise<BazaarBranch[]> {
    try {
      return (await discoverSiblingBranchMetadata(this.rootPath)).map(metadataToBazaarBranch);
    } catch (error) {
      this.output?.appendLine(`Bazaar ブランチのローカル fallback 検出に失敗しました: ${formatError(error)}`);
      return [];
    }
  }

  private async openWorktreeBranch(targetPath: string): Promise<void> {
    const answer = await vscode.window.showWarningMessage(
      `この VS Code ウィンドウを ${targetPath} に移動します。現在の作業ツリーには bzr switch を実行しません。`,
      { modal: true },
      '作業ツリーを開く'
    );
    if (answer !== '作業ツリーを開く') {
      return;
    }

    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(targetPath), false);
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
