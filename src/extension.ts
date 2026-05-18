import * as path from 'node:path';
import * as vscode from 'vscode';
import { BazaarClient } from './bazaar/client';
import { formatBazaarCommandTrace, type BazaarTraceMode } from './bazaar/commandTrace';
import { BazaarTraceStore } from './bazaar/traceStore';
import { findFirstBazaarWorkspaceRoot } from './bazaar/workspaceRoot';
import { UNAVAILABLE_COMMANDS } from './extensionCommands';
import { BazaarScmProvider } from './scm/bazaarScmProvider';
import { BazaarGeneratedDocumentProvider } from './scm/generatedDocumentProvider';
import { BazaarOriginalDocumentProvider } from './scm/originalDocumentProvider';
import { BazaarRevisionDocumentProvider } from './scm/revisionDocumentProvider';
import { BazaarBlameController } from './views/blameController';
import { BazaarBranchView } from './views/branchView';
import { BazaarExploreView } from './views/exploreView';
import { BazaarGraphView } from './views/graphView';
import { BazaarHistoryView } from './views/historyView';
import { RefreshScheduler } from './views/refreshScheduler';
import { BazaarRevisionCache } from './views/revisionCache';
import { BazaarShelveView } from './views/shelveView';
import { BazaarTagView } from './views/tagView';
import {
  createBranchSwitchRefreshTargets,
  createCommitRefreshTargets,
  formatViewRefreshFailure,
  refreshBazaarViewTargets
} from './views/viewRefresh';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('Bazaar');
  const generatedProvider = new BazaarGeneratedDocumentProvider();
  const config = vscode.workspace.getConfiguration('bazaar');
  const traceStore = new BazaarTraceStore(
    config.get<number>('trace.maxEntries', 20),
    config.get<number>('trace.maxStoredOutputChars', 200000)
  );
  const controller = new BazaarExtensionController(context, output, generatedProvider, traceStore);

  context.subscriptions.push(
    output,
    generatedProvider,
    vscode.workspace.registerTextDocumentContentProvider(BazaarGeneratedDocumentProvider.scheme, generatedProvider),
    controller
  );

  await controller.initialize();
}

export function deactivate(): void {
  // VS Code disposes registered subscriptions.
}

class BazaarExtensionController implements vscode.Disposable {
  private readonly staticDisposables: vscode.Disposable[] = [];
  private readonly dynamicDisposables: vscode.Disposable[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel,
    private readonly generatedProvider: BazaarGeneratedDocumentProvider,
    private readonly traceStore: BazaarTraceStore
  ) {
    this.staticDisposables.push(
      vscode.commands.registerCommand('bazaar.openOutput', () => this.output.show()),
      vscode.commands.registerCommand('bazaar.enableForWorkspace', () => this.setEnabled(true)),
      vscode.commands.registerCommand('bazaar.disableForWorkspace', () => this.setEnabled(false)),
      vscode.commands.registerCommand('bazaar.trace.openLast', () => this.openLastTrace())
    );
  }

  async initialize(): Promise<void> {
    this.disposeDynamic();
    this.traceStore.clear();

    const config = vscode.workspace.getConfiguration('bazaar');
    const featureEnabled = config.get<boolean>('enabled', true);
    await this.setContext('bazaar.featureEnabled', featureEnabled);
    await this.setContext('bazaar.repositoryReady', false);

    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    if (workspaceFolders.length === 0) {
      this.output.appendLine('ワークスペースフォルダーが開かれていません。');
      this.registerUnavailableCommands('ワークスペースフォルダーが開かれていません。');
      return;
    }

    if (!featureEnabled) {
      this.output.appendLine('Bazaar 拡張機能はこのワークスペースで無効です。');
      this.registerUnavailableCommands('Bazaar 拡張機能はこのワークスペースで無効です。');
      return;
    }

    const cliPath = config.get<string>('cliPath', 'bzr');
    const rootPath = await findFirstBazaarWorkspaceRoot(
      workspaceFolders.map((folder) => folder.uri.fsPath),
      (workspacePath) => this.createBazaarClient(workspacePath, cliPath),
      this.output
    );
    if (!rootPath) {
      this.registerUnavailableCommands('有効な Bazaar 作業ツリーがありません。');
      return;
    }

    await this.setContext('bazaar.repositoryReady', true);
    await this.registerActiveBazaar(rootPath, cliPath);
  }

  dispose(): void {
    this.disposeDynamic();
    for (const disposable of this.staticDisposables.splice(0)) {
      disposable.dispose();
    }
  }

  private async setEnabled(enabled: boolean): Promise<void> {
    await vscode.workspace.getConfiguration('bazaar').update('enabled', enabled, vscode.ConfigurationTarget.Workspace);
    this.output.appendLine(enabled
      ? 'Bazaar 拡張機能をこのワークスペースで有効化しました。'
      : 'Bazaar 拡張機能をこのワークスペースで無効化しました。');
    await this.initialize();
  }

  private async openLastTrace(): Promise<void> {
    const trace = this.traceStore.latest();
    if (!trace) {
      vscode.window.showInformationMessage('Bazaar コマンド履歴はありません。');
      return;
    }

    const content = [
      '=== Bazaar コマンド ===',
      `cwd: ${trace.cwd}`,
      `command: ${trace.commandLine}`,
      `exit code: ${trace.result.exitCode}`,
      '',
      '=== stdout ===',
      trace.result.stdout.trimEnd() || '(なし)',
      '',
      '=== stderr ===',
      trace.result.stderr.trimEnd() || '(なし)'
    ].join('\n');
    const document = await this.generatedProvider.openDocument('Bazaar 直近コマンド出力', content, 'text');
    await vscode.window.showTextDocument(document, { preview: true });
  }

  private async registerActiveBazaar(rootPath: string, cliPath: string): Promise<void> {
    const statusClient = this.createBazaarClient(rootPath, cliPath);
    const metadataClient = this.createBazaarClient(rootPath, cliPath);
    const originalProvider = new BazaarOriginalDocumentProvider(rootPath, statusClient, this.output);
    const revisionProvider = new BazaarRevisionDocumentProvider(metadataClient, this.output);
    const revisionCache = new BazaarRevisionCache(rootPath, metadataClient, this.output);
    const exploreView = new BazaarExploreView(rootPath, statusClient, metadataClient, revisionCache, this.output);
    const historyView = new BazaarHistoryView(rootPath, metadataClient, revisionCache, revisionProvider, this.generatedProvider, this.output);
    const tagView = new BazaarTagView(metadataClient);
    const graphView = new BazaarGraphView(revisionCache, this.output);
    const shelveView = new BazaarShelveView(rootPath, metadataClient, this.generatedProvider, this.output);
    const blameController = new BazaarBlameController(rootPath, metadataClient, revisionProvider, this.generatedProvider, this.output);
    const refreshAfterCommit = async () => {
      revisionCache.invalidate();
      const failures = await refreshBazaarViewTargets(createCommitRefreshTargets({
        explore: exploreView,
        history: historyView,
        graph: graphView
      }));

      for (const failure of failures) {
        this.output.appendLine(`コミット後の Bazaar 更新に失敗しました: ${formatViewRefreshFailure(failure)}`);
      }
      if (failures.length > 0) {
        vscode.window.showWarningMessage('Bazaar コミットは完了しましたが、一部の履歴ビューを更新できませんでした。詳細は Bazaar 出力を確認してください。');
      }
    };
    const provider = new BazaarScmProvider(rootPath, statusClient, originalProvider, this.generatedProvider, this.output, refreshAfterCommit);
    let branchView: BazaarBranchView;
    const refreshAfterBranchSwitch = async () => {
      revisionCache.invalidate();
      const failures = await refreshBazaarViewTargets(createBranchSwitchRefreshTargets({
        sourceControl: provider,
        blame: blameController,
        explore: exploreView,
        history: historyView,
        branches: branchView,
        tags: tagView,
        shelves: shelveView,
        graph: graphView
      }));

      for (const failure of failures) {
        this.output.appendLine(`ブランチ切替後の Bazaar 更新に失敗しました: ${formatViewRefreshFailure(failure)}`);
      }
      if (failures.length > 0) {
        vscode.window.showWarningMessage('Bazaar ブランチは切り替わりましたが、一部のビューを更新できませんでした。詳細は Bazaar 出力を確認してください。');
      }
    };
    branchView = new BazaarBranchView(rootPath, metadataClient, this.output, refreshAfterBranchSwitch);

    this.dynamicDisposables.push(
      provider,
      originalProvider,
      revisionProvider,
      exploreView,
      historyView,
      branchView,
      tagView,
      graphView,
      shelveView,
      blameController,
      vscode.workspace.registerTextDocumentContentProvider(BazaarOriginalDocumentProvider.scheme, originalProvider),
      vscode.workspace.registerTextDocumentContentProvider(BazaarRevisionDocumentProvider.scheme, revisionProvider),
      vscode.window.registerWebviewViewProvider('bazaarExplore', exploreView, { webviewOptions: { retainContextWhenHidden: true } }),
      vscode.window.registerTreeDataProvider('bazaarHistory', historyView),
      vscode.window.registerTreeDataProvider('bazaarBranches', branchView),
      vscode.window.registerTreeDataProvider('bazaarTags', tagView),
      vscode.window.registerTreeDataProvider('bazaarShelves', shelveView),
      vscode.window.registerWebviewViewProvider('bazaarGraph', graphView, { webviewOptions: { retainContextWhenHidden: true } }),
      vscode.languages.registerHoverProvider({ scheme: 'file' }, blameController),
      vscode.commands.registerCommand('bazaar.explore.open', () => exploreView.open()),
      vscode.commands.registerCommand('bazaar.explore.openEditor', () => exploreView.openEditor()),
      vscode.commands.registerCommand('bazaar.explore.refresh', () => runCommand(this.output, 'EXPLORE 更新', () => exploreView.refresh())),
      vscode.commands.registerCommand('bazaar.history.refresh', () => runCommand(this.output, '履歴更新', () => historyView.refresh())),
      vscode.commands.registerCommand('bazaar.history.search', () => runCommand(this.output, '履歴検索', () => historyView.search())),
      vscode.commands.registerCommand('bazaar.history.clearFileFilter', () => runCommand(this.output, 'ファイル履歴フィルターのクリア', () => historyView.clearFileFilter())),
      vscode.commands.registerCommand('bazaar.history.showFileHistory', (uri?: vscode.Uri) => runCommand(this.output, 'ファイル履歴表示', () => historyView.showFileHistory(uri))),
      vscode.commands.registerCommand('bazaar.history.openEditor', () => historyView.openEditor()),
      vscode.commands.registerCommand('bazaar.history.showCommit', (revision) => runCommand(this.output, 'コミット表示', () => historyView.showCommit(revision))),
      vscode.commands.registerCommand('bazaar.history.showCommitDiff', (revision, changedPath?: string) => runCommand(this.output, 'コミット差分表示', () => historyView.showCommitDiff(revision, changedPath))),
      vscode.commands.registerCommand('bazaar.history.copyRevisionId', (revision) => runCommand(this.output, 'リビジョン ID コピー', () => historyView.copyRevisionId(revision))),
      vscode.commands.registerCommand('bazaar.history.openFileAtRevision', (revision, changedPath?: string) => runCommand(this.output, '指定リビジョンのファイル表示', () => historyView.openFileAtRevision(revision, changedPath))),
      vscode.commands.registerCommand('bazaar.blame.toggle', () => runCommand(this.output, 'blame 表示切替', () => blameController.toggle())),
      vscode.commands.registerCommand('bazaar.blame.showCommit', () => runCommand(this.output, 'blame コミット表示', () => blameController.showCommit())),
      vscode.commands.registerCommand('bazaar.blame.showDiff', () => runCommand(this.output, 'blame 差分表示', () => blameController.showDiff())),
      vscode.commands.registerCommand('bazaar.blame.openFileAtRevision', () => runCommand(this.output, 'blame リビジョンファイル表示', () => blameController.openFileAtRevision())),
      vscode.commands.registerCommand('bazaar.blame.openLineChangesWithPreviousRevision', () => runCommand(this.output, '前リビジョンとの行差分表示', () => blameController.openLineChangesWithPreviousRevision())),
      vscode.commands.registerCommand('bazaar.blame.openLineChangesWithWorkingFile', () => runCommand(this.output, '作業中ファイルとの行差分表示', () => blameController.openLineChangesWithWorkingFile())),
      vscode.commands.registerCommand('bazaar.blame.openChangesWithPreviousRevision', () => runCommand(this.output, '前リビジョンとの差分表示', () => blameController.openChangesWithPreviousRevision())),
      vscode.commands.registerCommand('bazaar.blame.openChangesWithRevision', () => runCommand(this.output, 'リビジョンとの差分表示', () => blameController.openChangesWithRevision())),
      vscode.commands.registerCommand('bazaar.blame.openChangesWithBranchOrTag', () => runCommand(this.output, 'ブランチまたはタグとの差分表示', () => blameController.openChangesWithBranchOrTag())),
      vscode.commands.registerCommand('bazaar.blame.quickShowLineCommit', () => runCommand(this.output, '現在行のコミット表示', () => blameController.quickShowLineCommit())),
      vscode.commands.registerCommand('bazaar.blame.inspectLineCommitDetails', () => runCommand(this.output, '現在行のコミット詳細調査', () => blameController.inspectLineCommitDetails())),
      vscode.window.onDidChangeActiveTextEditor((editor) => runCommand(this.output, 'blame 更新', () => blameController.update(editor))),
      vscode.window.onDidChangeTextEditorSelection((event) => runCommand(this.output, 'blame 選択更新', () => blameController.update(event.textEditor))),
      vscode.commands.registerCommand('bazaar.branch.refresh', () => runCommand(this.output, 'ブランチ更新', () => branchView.refresh())),
      vscode.commands.registerCommand('bazaar.branch.create', () => runCommand(this.output, 'ブランチ作成', () => branchView.create())),
      vscode.commands.registerCommand('bazaar.branch.switch', (branch) => runCommand(this.output, 'ブランチ切替', () => branchView.switch(branch))),
      vscode.commands.registerCommand('bazaar.branch.switchForce', (branch) => runCommand(this.output, 'ブランチ強制切替', () => branchView.switch(branch, true))),
      vscode.commands.registerCommand('bazaar.branch.remove', (branch) => runCommand(this.output, 'ブランチ削除', () => branchView.remove(branch))),
      vscode.commands.registerCommand('bazaar.branch.removeForce', (branch) => runCommand(this.output, 'ブランチ強制削除', () => branchView.remove(branch, true))),
      vscode.commands.registerCommand('bazaar.tag.refresh', () => runCommand(this.output, 'タグ更新', () => tagView.refresh())),
      vscode.commands.registerCommand('bazaar.tag.create', () => runCommand(this.output, 'タグ作成', () => tagView.create())),
      vscode.commands.registerCommand('bazaar.tag.delete', (tag) => runCommand(this.output, 'タグ削除', () => tagView.delete(tag))),
      vscode.commands.registerCommand('bazaar.tag.forceMove', (tag) => runCommand(this.output, 'タグ強制移動', () => tagView.create(true, tag))),
      vscode.commands.registerCommand('bazaar.shelve.refresh', () => runCommand(this.output, 'シェルブ更新', () => shelveView.refresh())),
      vscode.commands.registerCommand('bazaar.shelve.create', (resource) => runCommand(this.output, 'シェルブ作成', () => shelveView.create(resource))),
      vscode.commands.registerCommand('bazaar.shelve.createAll', () => runCommand(this.output, 'すべてシェルブ', () => shelveView.createAll())),
      vscode.commands.registerCommand('bazaar.shelve.preview', (shelf) => runCommand(this.output, 'シェルブプレビュー', () => shelveView.preview(shelf))),
      vscode.commands.registerCommand('bazaar.shelve.apply', (shelf) => runCommand(this.output, 'シェルブ適用', () => shelveView.apply(shelf))),
      vscode.commands.registerCommand('bazaar.shelve.keep', (shelf) => runCommand(this.output, 'シェルブ適用と保持', () => shelveView.keep(shelf))),
      vscode.commands.registerCommand('bazaar.shelve.delete', (shelf) => runCommand(this.output, 'シェルブ削除', () => shelveView.delete(shelf))),
      vscode.commands.registerCommand('bazaar.graph.open', () => graphView.open()),
      vscode.commands.registerCommand('bazaar.graph.openEditor', () => graphView.openEditor()),
      vscode.commands.registerCommand('bazaar.graph.refresh', () => runCommand(this.output, 'グラフ更新', () => graphView.refresh()))
    );

    this.registerAutoRefresh(rootPath, provider, blameController, exploreView);
    await provider.refresh();
  }

  private registerAutoRefresh(
    rootPath: string,
    provider: BazaarScmProvider,
    blameController: BazaarBlameController,
    exploreView: BazaarExploreView
  ): void {
    const config = vscode.workspace.getConfiguration('bazaar');
    if (!config.get<boolean>('autoRefresh.enabled', true)) {
      return;
    }

    const debounceMs = config.get<number>('autoRefresh.debounceMs', 750);
    const scheduler = new RefreshScheduler(this.output, async () => {
      await provider.refresh();
      await blameController.refresh();
      if (exploreView.isVisible()) {
        await exploreView.refresh();
      }
    });
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(rootPath, '**/*'));
    const schedule = (uri: vscode.Uri, delayMs = debounceMs) => {
      if (!isBazaarWorkspaceFile(rootPath, uri)) {
        return;
      }
      scheduler.schedule(uri.fsPath, delayMs);
    };

    this.dynamicDisposables.push(
      scheduler,
      watcher,
      watcher.onDidCreate((uri) => schedule(uri)),
      watcher.onDidChange((uri) => schedule(uri)),
      watcher.onDidDelete((uri) => schedule(uri)),
      vscode.workspace.onDidSaveTextDocument((document) => schedule(document.uri, 50))
    );
  }

  private registerUnavailableCommands(message: string): void {
    const showUnavailable = () => {
      this.output.appendLine(message);
      vscode.window.showInformationMessage(message);
    };

    for (const command of UNAVAILABLE_COMMANDS) {
      this.dynamicDisposables.push(vscode.commands.registerCommand(command, showUnavailable));
    }
  }

  private createBazaarClient(cwd: string, cliPath: string): BazaarClient {
    const config = vscode.workspace.getConfiguration('bazaar');
    return new BazaarClient({
      cwd,
      cliPath,
      timeoutMs: config.get<number>('command.timeoutMs', 30000),
      onCommandComplete: (trace) => {
        this.traceStore.add(trace);
        const currentConfig = vscode.workspace.getConfiguration('bazaar');
        for (const line of formatBazaarCommandTrace(trace, {
          mode: currentConfig.get<BazaarTraceMode>('trace.mode', 'summary'),
          maxOutputChars: currentConfig.get<number>('trace.maxOutputChars', 4000),
          maxOutputLines: currentConfig.get<number>('trace.maxOutputLines', 80),
          omitLargeCommandOutput: currentConfig.get<boolean>('trace.omitLargeCommandOutput', true)
        })) {
          this.output.appendLine(line);
        }
      }
    });
  }

  private async setContext(key: string, value: boolean): Promise<void> {
    await vscode.commands.executeCommand('setContext', key, value);
  }

  private disposeDynamic(): void {
    for (const disposable of this.dynamicDisposables.splice(0)) {
      disposable.dispose();
    }
  }
}

function isBazaarWorkspaceFile(rootPath: string, uri: vscode.Uri): boolean {
  if (uri.scheme !== 'file') {
    return false;
  }
  if (uri.fsPath.includes(`${path.sep}.bzr${path.sep}`)) {
    return false;
  }
  const relativePath = path.relative(rootPath, uri.fsPath);
  return Boolean(relativePath) && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

async function runCommand(output: vscode.OutputChannel, label: string, command: () => Promise<void> | void): Promise<void> {
  try {
    await command();
  } catch (error) {
    output.appendLine(`Bazaar ${label} に失敗しました: ${formatError(error)}`);
    output.show(true);
    vscode.window.showErrorMessage(`Bazaar ${label} に失敗しました。詳細は Bazaar 出力を確認してください。`);
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
