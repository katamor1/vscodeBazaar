import * as path from 'node:path';
import * as vscode from 'vscode';
import { BazaarClient } from './bazaar/client';
import { findDotBzrRoot } from './bazaar/rootFinder';
import { UNAVAILABLE_COMMANDS } from './extensionCommands';
import { BazaarScmProvider } from './scm/bazaarScmProvider';
import { BazaarGeneratedDocumentProvider } from './scm/generatedDocumentProvider';
import { BazaarOriginalDocumentProvider } from './scm/originalDocumentProvider';
import { BazaarRevisionDocumentProvider } from './scm/revisionDocumentProvider';
import { BazaarBlameController } from './views/blameController';
import { BazaarBranchView } from './views/branchView';
import { BazaarGraphView } from './views/graphView';
import { BazaarHistoryView } from './views/historyView';
import { BazaarShelveView } from './views/shelveView';
import { BazaarTagView } from './views/tagView';
import {
  createBranchSwitchRefreshTargets,
  formatViewRefreshFailure,
  refreshBazaarViewTargets
} from './views/viewRefresh';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('Bazaar');
  context.subscriptions.push(output);

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    output.appendLine('No workspace folder is open.');
    registerUnavailableCommands(context, output, 'No workspace folder is open.');
    return;
  }

  const cliPath = vscode.workspace.getConfiguration('bazaar').get<string>('cliPath', 'bzr');
  const initialClient = new BazaarClient({
    cwd: workspaceFolder.uri.fsPath,
    cliPath
  });

  const rootPath = await findBazaarRoot(workspaceFolder.uri.fsPath, initialClient, output);
  if (!rootPath) {
    registerUnavailableCommands(context, output, 'No Bazaar working tree is active.');
    return;
  }

  const client = new BazaarClient({ cwd: rootPath, cliPath });
  const originalProvider = new BazaarOriginalDocumentProvider(rootPath, client, output);
  const revisionProvider = new BazaarRevisionDocumentProvider(client, output);
  const generatedProvider = new BazaarGeneratedDocumentProvider();
  const provider = new BazaarScmProvider(rootPath, client, originalProvider, generatedProvider, output);
  const historyView = new BazaarHistoryView(rootPath, client, revisionProvider, generatedProvider, output);
  const tagView = new BazaarTagView(client);
  const graphView = new BazaarGraphView(client);
  const shelveView = new BazaarShelveView(rootPath, client, generatedProvider, output);
  const blameController = new BazaarBlameController(rootPath, client, revisionProvider, generatedProvider, output);
  let branchView: BazaarBranchView;
  const refreshAfterBranchSwitch = async () => {
    const failures = await refreshBazaarViewTargets(createBranchSwitchRefreshTargets({
      sourceControl: provider,
      blame: blameController,
      history: historyView,
      branches: branchView,
      tags: tagView,
      shelves: shelveView,
      graph: graphView
    }));

    for (const failure of failures) {
      output.appendLine(`Bazaar refresh after branch switch failed: ${formatViewRefreshFailure(failure)}`);
    }
    if (failures.length > 0) {
      vscode.window.showWarningMessage('Bazaar branch switched, but some views could not be refreshed. See Bazaar output for details.');
    }
  };
  branchView = new BazaarBranchView(rootPath, client, output, refreshAfterBranchSwitch);

  context.subscriptions.push(
    provider,
    originalProvider,
    revisionProvider,
    generatedProvider,
    historyView,
    branchView,
    tagView,
    graphView,
    shelveView,
    blameController,
    vscode.workspace.registerTextDocumentContentProvider(BazaarOriginalDocumentProvider.scheme, originalProvider),
    vscode.workspace.registerTextDocumentContentProvider(BazaarRevisionDocumentProvider.scheme, revisionProvider),
    vscode.workspace.registerTextDocumentContentProvider(BazaarGeneratedDocumentProvider.scheme, generatedProvider),
    vscode.window.registerTreeDataProvider('bazaarHistory', historyView),
    vscode.window.registerTreeDataProvider('bazaarBranches', branchView),
    vscode.window.registerTreeDataProvider('bazaarTags', tagView),
    vscode.window.registerTreeDataProvider('bazaarShelves', shelveView),
    vscode.window.registerWebviewViewProvider('bazaarGraph', graphView, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.languages.registerHoverProvider({ scheme: 'file' }, blameController),
    vscode.commands.registerCommand('bazaar.history.refresh', () => runCommand(output, 'history refresh', () => historyView.refresh())),
    vscode.commands.registerCommand('bazaar.history.search', () => runCommand(output, 'history search', () => historyView.search())),
    vscode.commands.registerCommand('bazaar.history.clearFileFilter', () => runCommand(output, 'history clear file filter', () => historyView.clearFileFilter())),
    vscode.commands.registerCommand('bazaar.history.showFileHistory', (uri?: vscode.Uri) => runCommand(output, 'file history', () => historyView.showFileHistory(uri))),
    vscode.commands.registerCommand('bazaar.history.showCommit', (revision) => runCommand(output, 'show commit', () => historyView.showCommit(revision))),
    vscode.commands.registerCommand('bazaar.history.showCommitDiff', (revision, changedPath?: string) => runCommand(output, 'show commit diff', () => historyView.showCommitDiff(revision, changedPath))),
    vscode.commands.registerCommand('bazaar.history.copyRevisionId', (revision) => runCommand(output, 'copy revision id', () => historyView.copyRevisionId(revision))),
    vscode.commands.registerCommand('bazaar.history.openFileAtRevision', (revision, changedPath?: string) => runCommand(output, 'open file at revision', () => historyView.openFileAtRevision(revision, changedPath))),
    vscode.commands.registerCommand('bazaar.blame.toggle', () => runCommand(output, 'toggle blame', () => blameController.toggle())),
    vscode.commands.registerCommand('bazaar.blame.showCommit', () => runCommand(output, 'blame show commit', () => blameController.showCommit())),
    vscode.commands.registerCommand('bazaar.blame.showDiff', () => runCommand(output, 'blame show diff', () => blameController.showDiff())),
    vscode.commands.registerCommand('bazaar.blame.openFileAtRevision', () => runCommand(output, 'blame open file at revision', () => blameController.openFileAtRevision())),
    vscode.commands.registerCommand('bazaar.blame.openLineChangesWithPreviousRevision', () => runCommand(output, 'blame open line changes with previous revision', () => blameController.openLineChangesWithPreviousRevision())),
    vscode.commands.registerCommand('bazaar.blame.openLineChangesWithWorkingFile', () => runCommand(output, 'blame open line changes with working file', () => blameController.openLineChangesWithWorkingFile())),
    vscode.commands.registerCommand('bazaar.blame.openChangesWithPreviousRevision', () => runCommand(output, 'blame open changes with previous revision', () => blameController.openChangesWithPreviousRevision())),
    vscode.commands.registerCommand('bazaar.blame.openChangesWithRevision', () => runCommand(output, 'blame open changes with revision', () => blameController.openChangesWithRevision())),
    vscode.commands.registerCommand('bazaar.blame.openChangesWithBranchOrTag', () => runCommand(output, 'blame open changes with branch or tag', () => blameController.openChangesWithBranchOrTag())),
    vscode.commands.registerCommand('bazaar.blame.quickShowLineCommit', () => runCommand(output, 'blame quick show line commit', () => blameController.quickShowLineCommit())),
    vscode.commands.registerCommand('bazaar.blame.inspectLineCommitDetails', () => runCommand(output, 'blame inspect line commit details', () => blameController.inspectLineCommitDetails())),
    vscode.window.onDidChangeActiveTextEditor((editor) => runCommand(output, 'update blame', () => blameController.update(editor))),
    vscode.window.onDidChangeTextEditorSelection((event) => runCommand(output, 'update blame selection', () => blameController.update(event.textEditor))),
    vscode.workspace.onDidSaveTextDocument(() => runCommand(output, 'refresh blame', () => blameController.refresh())),
    vscode.commands.registerCommand('bazaar.branch.refresh', () => runCommand(output, 'branch refresh', () => branchView.refresh())),
    vscode.commands.registerCommand('bazaar.branch.create', () => runCommand(output, 'branch create', () => branchView.create())),
    vscode.commands.registerCommand('bazaar.branch.switch', (branch) => runCommand(output, 'branch switch', () => branchView.switch(branch))),
    vscode.commands.registerCommand('bazaar.branch.switchForce', (branch) => runCommand(output, 'branch force switch', () => branchView.switch(branch, true))),
    vscode.commands.registerCommand('bazaar.branch.remove', (branch) => runCommand(output, 'branch remove', () => branchView.remove(branch))),
    vscode.commands.registerCommand('bazaar.branch.removeForce', (branch) => runCommand(output, 'branch force remove', () => branchView.remove(branch, true))),
    vscode.commands.registerCommand('bazaar.tag.refresh', () => runCommand(output, 'tag refresh', () => tagView.refresh())),
    vscode.commands.registerCommand('bazaar.tag.create', () => runCommand(output, 'tag create', () => tagView.create())),
    vscode.commands.registerCommand('bazaar.tag.delete', (tag) => runCommand(output, 'tag delete', () => tagView.delete(tag))),
    vscode.commands.registerCommand('bazaar.tag.forceMove', (tag) => runCommand(output, 'tag force move', () => tagView.create(true, tag))),
    vscode.commands.registerCommand('bazaar.shelve.refresh', () => runCommand(output, 'shelve refresh', () => shelveView.refresh())),
    vscode.commands.registerCommand('bazaar.shelve.create', (resource) => runCommand(output, 'shelve create', () => shelveView.create(resource))),
    vscode.commands.registerCommand('bazaar.shelve.createAll', () => runCommand(output, 'shelve all', () => shelveView.createAll())),
    vscode.commands.registerCommand('bazaar.shelve.preview', (shelf) => runCommand(output, 'shelve preview', () => shelveView.preview(shelf))),
    vscode.commands.registerCommand('bazaar.shelve.apply', (shelf) => runCommand(output, 'shelve apply', () => shelveView.apply(shelf))),
    vscode.commands.registerCommand('bazaar.shelve.keep', (shelf) => runCommand(output, 'shelve keep', () => shelveView.keep(shelf))),
    vscode.commands.registerCommand('bazaar.shelve.delete', (shelf) => runCommand(output, 'shelve delete', () => shelveView.delete(shelf))),
    vscode.commands.registerCommand('bazaar.graph.open', () => graphView.open()),
    vscode.commands.registerCommand('bazaar.graph.refresh', () => runCommand(output, 'graph refresh', () => graphView.refresh()))
  );

  registerAutoRefresh(context, rootPath, output, async () => {
    await provider.refresh();
    await blameController.refresh();
  });

  await provider.refresh();
  await runCommand(output, 'initial history refresh', () => historyView.refresh());
  await runCommand(output, 'initial branch refresh', () => branchView.refresh());
  await runCommand(output, 'initial tag refresh', () => tagView.refresh());
  await runCommand(output, 'initial shelve refresh', () => shelveView.refresh());
  await runCommand(output, 'initial graph refresh', () => graphView.refresh());
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
    output.appendLine(`No Bazaar working tree found at ${workspacePath}.`);
    output.appendLine(`bzr root failed: ${formatError(error)}`);
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
      void runCommand(output, 'auto refresh', refresh);
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

async function runCommand(output: vscode.OutputChannel, label: string, command: () => Promise<void> | void): Promise<void> {
  try {
    await command();
  } catch (error) {
    output.appendLine(`Bazaar ${label} failed: ${formatError(error)}`);
    output.show(true);
    vscode.window.showErrorMessage(`Bazaar ${label} failed. See Bazaar output for details.`);
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
