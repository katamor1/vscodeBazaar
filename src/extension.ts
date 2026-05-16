import * as path from 'node:path';
import * as vscode from 'vscode';
import { BazaarClient } from './bazaar/client';
import { formatBazaarCommandTrace } from './bazaar/commandTrace';
import { findDotBzrRoot } from './bazaar/rootFinder';
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
  context.subscriptions.push(output);

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    output.appendLine('ワークスペースフォルダーが開かれていません。');
    registerUnavailableCommands(context, output, 'ワークスペースフォルダーが開かれていません。');
    return;
  }

  const cliPath = vscode.workspace.getConfiguration('bazaar').get<string>('cliPath', 'bzr');
  const initialClient = createBazaarClient(workspaceFolder.uri.fsPath, cliPath, output);

  const rootPath = await findBazaarRoot(workspaceFolder.uri.fsPath, initialClient, output);
  if (!rootPath) {
    registerUnavailableCommands(context, output, '有効な Bazaar 作業ツリーがありません。');
    return;
  }

  const client = createBazaarClient(rootPath, cliPath, output);
  const originalProvider = new BazaarOriginalDocumentProvider(rootPath, client, output);
  const revisionProvider = new BazaarRevisionDocumentProvider(client, output);
  const generatedProvider = new BazaarGeneratedDocumentProvider();
  const exploreView = new BazaarExploreView(rootPath, client, output);
  const historyView = new BazaarHistoryView(rootPath, client, revisionProvider, generatedProvider, output);
  const tagView = new BazaarTagView(client);
  const graphView = new BazaarGraphView(rootPath, client, output);
  const shelveView = new BazaarShelveView(rootPath, client, generatedProvider, output);
  const blameController = new BazaarBlameController(rootPath, client, revisionProvider, generatedProvider, output);
  const refreshAfterCommit = async () => {
    const failures = await refreshBazaarViewTargets(createCommitRefreshTargets({
      explore: exploreView,
      history: historyView,
      graph: graphView
    }));

    for (const failure of failures) {
      output.appendLine(`コミット後の Bazaar 更新に失敗しました: ${formatViewRefreshFailure(failure)}`);
    }
    if (failures.length > 0) {
      vscode.window.showWarningMessage('Bazaar コミットは完了しましたが、一部の履歴ビューを更新できませんでした。詳細は Bazaar 出力を確認してください。');
    }
  };
  const provider = new BazaarScmProvider(rootPath, client, originalProvider, generatedProvider, output, refreshAfterCommit);
  let branchView: BazaarBranchView;
  const refreshAfterBranchSwitch = async () => {
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
      output.appendLine(`ブランチ切替後の Bazaar 更新に失敗しました: ${formatViewRefreshFailure(failure)}`);
    }
    if (failures.length > 0) {
      vscode.window.showWarningMessage('Bazaar ブランチは切り替わりましたが、一部のビューを更新できませんでした。詳細は Bazaar 出力を確認してください。');
    }
  };
  branchView = new BazaarBranchView(rootPath, client, output, refreshAfterBranchSwitch);

  context.subscriptions.push(
    provider,
    originalProvider,
    revisionProvider,
    generatedProvider,
    exploreView,
    historyView,
    branchView,
    tagView,
    graphView,
    shelveView,
    blameController,
    vscode.workspace.registerTextDocumentContentProvider(BazaarOriginalDocumentProvider.scheme, originalProvider),
    vscode.workspace.registerTextDocumentContentProvider(BazaarRevisionDocumentProvider.scheme, revisionProvider),
    vscode.workspace.registerTextDocumentContentProvider(BazaarGeneratedDocumentProvider.scheme, generatedProvider),
    vscode.window.registerWebviewViewProvider('bazaarExplore', exploreView, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.window.registerTreeDataProvider('bazaarHistory', historyView),
    vscode.window.registerTreeDataProvider('bazaarBranches', branchView),
    vscode.window.registerTreeDataProvider('bazaarTags', tagView),
    vscode.window.registerTreeDataProvider('bazaarShelves', shelveView),
    vscode.window.registerWebviewViewProvider('bazaarGraph', graphView, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.languages.registerHoverProvider({ scheme: 'file' }, blameController),
    vscode.commands.registerCommand('bazaar.explore.open', () => exploreView.open()),
    vscode.commands.registerCommand('bazaar.explore.refresh', () => runCommand(output, 'EXPLORE 更新', () => exploreView.refresh())),
    vscode.commands.registerCommand('bazaar.history.refresh', () => runCommand(output, '履歴更新', () => historyView.refresh())),
    vscode.commands.registerCommand('bazaar.history.search', () => runCommand(output, '履歴検索', () => historyView.search())),
    vscode.commands.registerCommand('bazaar.history.clearFileFilter', () => runCommand(output, 'ファイル履歴フィルターのクリア', () => historyView.clearFileFilter())),
    vscode.commands.registerCommand('bazaar.history.showFileHistory', (uri?: vscode.Uri) => runCommand(output, 'ファイル履歴表示', () => historyView.showFileHistory(uri))),
    vscode.commands.registerCommand('bazaar.history.showCommit', (revision) => runCommand(output, 'コミット表示', () => historyView.showCommit(revision))),
    vscode.commands.registerCommand('bazaar.history.showCommitDiff', (revision, changedPath?: string) => runCommand(output, 'コミット差分表示', () => historyView.showCommitDiff(revision, changedPath))),
    vscode.commands.registerCommand('bazaar.history.copyRevisionId', (revision) => runCommand(output, 'リビジョン ID コピー', () => historyView.copyRevisionId(revision))),
    vscode.commands.registerCommand('bazaar.history.openFileAtRevision', (revision, changedPath?: string) => runCommand(output, '指定リビジョンのファイル表示', () => historyView.openFileAtRevision(revision, changedPath))),
    vscode.commands.registerCommand('bazaar.blame.toggle', () => runCommand(output, 'blame 表示切替', () => blameController.toggle())),
    vscode.commands.registerCommand('bazaar.blame.showCommit', () => runCommand(output, 'blame コミット表示', () => blameController.showCommit())),
    vscode.commands.registerCommand('bazaar.blame.showDiff', () => runCommand(output, 'blame 差分表示', () => blameController.showDiff())),
    vscode.commands.registerCommand('bazaar.blame.openFileAtRevision', () => runCommand(output, 'blame リビジョンファイル表示', () => blameController.openFileAtRevision())),
    vscode.commands.registerCommand('bazaar.blame.openLineChangesWithPreviousRevision', () => runCommand(output, '前リビジョンとの行差分表示', () => blameController.openLineChangesWithPreviousRevision())),
    vscode.commands.registerCommand('bazaar.blame.openLineChangesWithWorkingFile', () => runCommand(output, '作業中ファイルとの行差分表示', () => blameController.openLineChangesWithWorkingFile())),
    vscode.commands.registerCommand('bazaar.blame.openChangesWithPreviousRevision', () => runCommand(output, '前リビジョンとの差分表示', () => blameController.openChangesWithPreviousRevision())),
    vscode.commands.registerCommand('bazaar.blame.openChangesWithRevision', () => runCommand(output, 'リビジョンとの差分表示', () => blameController.openChangesWithRevision())),
    vscode.commands.registerCommand('bazaar.blame.openChangesWithBranchOrTag', () => runCommand(output, 'ブランチまたはタグとの差分表示', () => blameController.openChangesWithBranchOrTag())),
    vscode.commands.registerCommand('bazaar.blame.quickShowLineCommit', () => runCommand(output, '現在行のコミット表示', () => blameController.quickShowLineCommit())),
    vscode.commands.registerCommand('bazaar.blame.inspectLineCommitDetails', () => runCommand(output, '現在行のコミット詳細調査', () => blameController.inspectLineCommitDetails())),
    vscode.window.onDidChangeActiveTextEditor((editor) => runCommand(output, 'blame 更新', () => blameController.update(editor))),
    vscode.window.onDidChangeTextEditorSelection((event) => runCommand(output, 'blame 選択更新', () => blameController.update(event.textEditor))),
    vscode.workspace.onDidSaveTextDocument(() => runCommand(output, 'blame 再読み込み', () => blameController.refresh())),
    vscode.commands.registerCommand('bazaar.branch.refresh', () => runCommand(output, 'ブランチ更新', () => branchView.refresh())),
    vscode.commands.registerCommand('bazaar.branch.create', () => runCommand(output, 'ブランチ作成', () => branchView.create())),
    vscode.commands.registerCommand('bazaar.branch.switch', (branch) => runCommand(output, 'ブランチ切替', () => branchView.switch(branch))),
    vscode.commands.registerCommand('bazaar.branch.switchForce', (branch) => runCommand(output, 'ブランチ強制切替', () => branchView.switch(branch, true))),
    vscode.commands.registerCommand('bazaar.branch.remove', (branch) => runCommand(output, 'ブランチ削除', () => branchView.remove(branch))),
    vscode.commands.registerCommand('bazaar.branch.removeForce', (branch) => runCommand(output, 'ブランチ強制削除', () => branchView.remove(branch, true))),
    vscode.commands.registerCommand('bazaar.tag.refresh', () => runCommand(output, 'タグ更新', () => tagView.refresh())),
    vscode.commands.registerCommand('bazaar.tag.create', () => runCommand(output, 'タグ作成', () => tagView.create())),
    vscode.commands.registerCommand('bazaar.tag.delete', (tag) => runCommand(output, 'タグ削除', () => tagView.delete(tag))),
    vscode.commands.registerCommand('bazaar.tag.forceMove', (tag) => runCommand(output, 'タグ強制移動', () => tagView.create(true, tag))),
    vscode.commands.registerCommand('bazaar.shelve.refresh', () => runCommand(output, 'シェルブ更新', () => shelveView.refresh())),
    vscode.commands.registerCommand('bazaar.shelve.create', (resource) => runCommand(output, 'シェルブ作成', () => shelveView.create(resource))),
    vscode.commands.registerCommand('bazaar.shelve.createAll', () => runCommand(output, 'すべてシェルブ', () => shelveView.createAll())),
    vscode.commands.registerCommand('bazaar.shelve.preview', (shelf) => runCommand(output, 'シェルブプレビュー', () => shelveView.preview(shelf))),
    vscode.commands.registerCommand('bazaar.shelve.apply', (shelf) => runCommand(output, 'シェルブ適用', () => shelveView.apply(shelf))),
    vscode.commands.registerCommand('bazaar.shelve.keep', (shelf) => runCommand(output, 'シェルブ適用と保持', () => shelveView.keep(shelf))),
    vscode.commands.registerCommand('bazaar.shelve.delete', (shelf) => runCommand(output, 'シェルブ削除', () => shelveView.delete(shelf))),
    vscode.commands.registerCommand('bazaar.graph.open', () => graphView.open()),
    vscode.commands.registerCommand('bazaar.graph.refresh', () => runCommand(output, 'グラフ更新', () => graphView.refresh()))
  );

  registerAutoRefresh(context, rootPath, output, async () => {
    await provider.refresh();
    await blameController.refresh();
    await exploreView.refresh();
  });

  await provider.refresh();
  await runCommand(output, '初期履歴更新', () => historyView.refresh());
  await runCommand(output, '初期ブランチ更新', () => branchView.refresh());
  await runCommand(output, '初期タグ更新', () => tagView.refresh());
  await runCommand(output, '初期シェルブ更新', () => shelveView.refresh());
  await runCommand(output, '初期グラフ更新', () => graphView.refresh());
}

export function deactivate(): void {
  // VS Code disposes registered subscriptions.
}

async function findBazaarRoot(
  workspacePath: string,
  client: BazaarClient,
  output: vscode.OutputChannel
): Promise<string | undefined> {
  const localRoot = await findDotBzrRoot(workspacePath);
  if (localRoot) {
    return localRoot;
  }

  try {
    return await client.root();
  } catch (error) {
    output.appendLine(`${workspacePath} に Bazaar 作業ツリーが見つかりません。`);
    output.appendLine(`bzr root が失敗しました: ${formatError(error)}`);
    return undefined;
  }
}

function registerUnavailableCommands(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
  message: string
): void {
  const showUnavailable = () => {
    output.appendLine(message);
    vscode.window.showInformationMessage(message);
  };

  context.subscriptions.push(vscode.commands.registerCommand('bazaar.openOutput', () => output.show()));
  for (const command of UNAVAILABLE_COMMANDS) {
    context.subscriptions.push(vscode.commands.registerCommand(command, showUnavailable));
  }
}

function registerAutoRefresh(
  context: vscode.ExtensionContext,
  rootPath: string,
  output: vscode.OutputChannel,
  refresh: () => Promise<void>
): void {
  const config = vscode.workspace.getConfiguration('bazaar');
  if (!config.get<boolean>('autoRefresh.enabled', true)) {
    return;
  }

  const debounceMs = config.get<number>('autoRefresh.debounceMs', 750);
  const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(rootPath, '**/*'));
  let timer: NodeJS.Timeout | undefined;
  const schedule = (uri: vscode.Uri) => {
    if (uri.fsPath.includes(`${path.sep}.bzr${path.sep}`)) {
      return;
    }
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      void runCommand(output, '自動更新', refresh);
    }, debounceMs);
  };

  context.subscriptions.push(
    watcher,
    watcher.onDidCreate(schedule),
    watcher.onDidChange(schedule),
    watcher.onDidDelete(schedule),
    new vscode.Disposable(() => {
      if (timer) {
        clearTimeout(timer);
      }
    })
  );
}

function createBazaarClient(cwd: string, cliPath: string, output: vscode.OutputChannel): BazaarClient {
  return new BazaarClient({
    cwd,
    cliPath,
    onCommandComplete: (trace) => {
      for (const line of formatBazaarCommandTrace(trace)) {
        output.appendLine(line);
      }
    }
  });
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
