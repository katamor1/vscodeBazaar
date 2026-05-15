import * as path from 'node:path';
import * as vscode from 'vscode';
import type { BazaarClient } from '../bazaar/client';
import { searchRevisions } from '../bazaar/historyParser';
import { normalizeRevisionSpec } from '../bazaar/revisionSpec';
import type { BazaarRevision } from '../bazaar/types';
import { BazaarRevisionDocumentProvider } from '../scm/revisionDocumentProvider';
import {
  resolveRevisionCommandTarget,
  revisionDisplayLabel,
  revisionSpecForCommand,
  revisionSpecForDocument
} from './historyTarget';

type HistoryNode =
  | { type: 'revision'; revision: BazaarRevision }
  | { type: 'detail'; label: string; description?: string; icon?: string; command?: vscode.Command };

export class BazaarHistoryView implements vscode.TreeDataProvider<HistoryNode>, vscode.Disposable {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<HistoryNode | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private revisions: BazaarRevision[] = [];
  private visibleRevisions: BazaarRevision[] = [];
  private query = '';
  private pathFilter: string | undefined;

  constructor(
    private readonly rootPath: string,
    private readonly client: BazaarClient,
    private readonly revisionProvider: BazaarRevisionDocumentProvider,
    private readonly output: vscode.OutputChannel
  ) {}

  getTreeItem(node: HistoryNode): vscode.TreeItem {
    if (node.type === 'revision') {
      const item = new vscode.TreeItem(
        `${revisionDisplayLabel(node.revision)} ${firstLine(node.revision.message)}`,
        vscode.TreeItemCollapsibleState.Collapsed
      );
      item.description = `${node.revision.committer} ${node.revision.tags.map((tag) => `#${tag}`).join(' ')}`.trim();
      item.tooltip = `${node.revision.message}\n${node.revision.timestamp}\n${node.revision.revisionId}`;
      item.iconPath = new vscode.ThemeIcon(node.revision.parentIds.length > 1 ? 'git-merge' : 'git-commit');
      item.contextValue = 'bazaarRevision';
      item.command = {
        command: 'bazaar.history.showCommit',
        title: 'Show Bazaar Commit',
        arguments: [node.revision]
      };
      return item;
    }

    const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
    item.description = node.description;
    item.iconPath = node.icon ? new vscode.ThemeIcon(node.icon) : undefined;
    item.command = node.command;
    item.contextValue = 'bazaarHistoryDetail';
    return item;
  }

  getChildren(node?: HistoryNode): HistoryNode[] {
    if (!node) {
      return this.visibleRevisions.map((revision) => ({ type: 'revision', revision }));
    }

    if (node.type !== 'revision') {
      return [];
    }

    const revision = node.revision;
    const details: HistoryNode[] = [
      { type: 'detail', label: revision.timestamp, icon: 'calendar' },
      {
        type: 'detail',
        label: revision.revisionId,
        icon: 'key',
        command: {
          command: 'bazaar.history.copyRevisionId',
          title: 'Copy Bazaar Revision Id',
          arguments: [revision]
        }
      },
      { type: 'detail', label: `Branch: ${revision.branchNick || '(unknown)'}`, icon: 'git-branch' }
    ];

    if (revision.tags.length > 0) {
      details.push({ type: 'detail', label: `Tags: ${revision.tags.join(', ')}`, icon: 'tag' });
    }
    if (revision.parentIds.length > 0) {
      details.push({ type: 'detail', label: `Parents: ${revision.parentIds.join(', ')}`, icon: 'references' });
    }
    for (const changedPath of revision.changedPaths ?? []) {
      details.push({
        type: 'detail',
        label: changedPath,
        icon: 'file',
        command: {
          command: 'bazaar.history.showCommitDiff',
          title: 'Show Bazaar Commit Diff',
          arguments: [revision, changedPath]
        }
      });
      details.push({
        type: 'detail',
        label: `Open ${changedPath} at ${revisionDisplayLabel(revision)}`,
        icon: 'go-to-file',
        command: {
          command: 'bazaar.history.openFileAtRevision',
          title: 'Open Bazaar File At Revision',
          arguments: [revision, changedPath]
        }
      });
    }
    details.push({
      type: 'detail',
      label: 'Show commit diff',
      icon: 'diff',
      command: {
        command: 'bazaar.history.showCommitDiff',
        title: 'Show Bazaar Commit Diff',
        arguments: [revision]
      }
    });

    return details;
  }

  async refresh(pathFilter?: string): Promise<void> {
    this.pathFilter = pathFilter;
    const config = vscode.workspace.getConfiguration('bazaar');
    const limit = config.get<number>('history.limit', 200);
    const includeMerged = config.get<boolean>('history.includeMerged', true);
    this.revisions = await this.client.log({ limit, includeMerged, path: pathFilter });
    this.visibleRevisions = this.query ? searchRevisions(this.revisions, this.query) : this.revisions;
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  async search(): Promise<void> {
    const query = await vscode.window.showInputBox({
      title: 'Search Bazaar History',
      value: this.query,
      prompt: 'Search revno, revision id, message, author, tag, branch, or changed path.'
    });
    if (query === undefined) {
      return;
    }

    this.query = query.trim();
    this.visibleRevisions = this.query ? searchRevisions(this.revisions, this.query) : this.revisions;
    if (this.query && this.visibleRevisions.length === 0) {
      const config = vscode.workspace.getConfiguration('bazaar');
      this.revisions = await this.client.log({
        limit: config.get<number>('history.limit', 200),
        includeMerged: config.get<boolean>('history.includeMerged', true),
        path: this.pathFilter,
        match: this.query
      });
      this.visibleRevisions = this.revisions;
    }
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  async clearFileFilter(): Promise<void> {
    await this.refresh(undefined);
  }

  async copyRevisionId(target?: unknown): Promise<void> {
    const revision = resolveRevisionCommandTarget(target);
    if (!revision) {
      showNoValidRevisionWarning();
      return;
    }
    const revisionId = normalizeRevisionSpec(revision.revisionId);
    if (!revisionId) {
      vscode.window.showWarningMessage('The selected Bazaar revision does not have a revision id.');
      return;
    }
    await vscode.env.clipboard.writeText(revisionId);
    vscode.window.showInformationMessage(`Copied Bazaar revision id ${revisionId}.`);
  }

  async showFileHistory(uri?: vscode.Uri): Promise<void> {
    const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!targetUri || targetUri.scheme !== 'file') {
      vscode.window.showWarningMessage('Open a file inside the Bazaar tree first.');
      return;
    }

    const relativePath = path.relative(this.rootPath, targetUri.fsPath).replace(/\\/g, '/');
    if (relativePath.startsWith('..')) {
      vscode.window.showWarningMessage('The selected file is outside the Bazaar tree.');
      return;
    }

    await this.refresh(relativePath);
  }

  async showCommit(target?: unknown): Promise<void> {
    const revision = resolveRevisionCommandTarget(target);
    if (!revision) {
      showNoValidRevisionWarning();
      return;
    }

    const content = [
      `revno: ${normalizeRevisionSpec(revision.revno) ?? '(unknown)'}`,
      `revision-id: ${normalizeRevisionSpec(revision.revisionId) ?? '(unknown)'}`,
      `committer: ${revision.committer}`,
      `branch: ${revision.branchNick}`,
      `timestamp: ${revision.timestamp}`,
      `parents: ${revision.parentIds.join(', ') || '(none)'}`,
      `tags: ${revision.tags.join(', ') || '(none)'}`,
      '',
      revision.message,
      '',
      ...(revision.changedPaths?.map((changedPath) => `* ${changedPath}`) ?? [])
    ].join('\n');

    const document = await vscode.workspace.openTextDocument({ content, language: 'text' });
    await vscode.window.showTextDocument(document, { preview: true });
  }

  async showCommitDiff(target?: unknown, changedPath?: string): Promise<void> {
    const revision = resolveRevisionCommandTarget(target);
    if (!revision) {
      showNoValidRevisionWarning();
      return;
    }
    const revisionSpec = revisionSpecForCommand(revision);
    if (!revisionSpec) {
      showNoValidRevisionWarning();
      return;
    }

    const diffMode = vscode.workspace.getConfiguration('bazaar').get<string>('history.diffMode', 'editor');
    if (diffMode === 'editor' && changedPath) {
      await this.openRevisionDiff(revision, changedPath);
      return;
    }

    const diff = await this.client.diffChange(revisionSpec, changedPath);
    this.output.appendLine(`bzr diff -c ${revisionSpec}${changedPath ? ` ${changedPath}` : ''}`);
    this.output.appendLine(diff.trimEnd());
    this.output.show();
  }

  async openFileAtRevision(target?: unknown, changedPath?: string): Promise<void> {
    const revision = resolveRevisionCommandTarget(target);
    if (!revision) {
      showNoValidRevisionWarning();
      return;
    }
    if (!changedPath) {
      return;
    }
    const revisionSpec = revisionSpecForDocument(revision);
    if (!revisionSpec) {
      showNoValidRevisionWarning();
      return;
    }
    const uri = this.revisionProvider.createUriForPath(changedPath, revisionSpec);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, { preview: true });
  }

  dispose(): void {
    this.onDidChangeTreeDataEmitter.dispose();
  }

  private async openRevisionDiff(revision: BazaarRevision, changedPath: string): Promise<void> {
    const rightRevisionSpec = revisionSpecForDocument(revision);
    if (!rightRevisionSpec) {
      showNoValidRevisionWarning();
      return;
    }
    const revisionLabel = revisionDisplayLabel(revision);
    const right = this.revisionProvider.createUriForPath(changedPath, rightRevisionSpec);
    const left = revision.parentIds[0]
      ? this.revisionProvider.createUriForPath(changedPath, `revid:${revision.parentIds[0]}`)
      : this.revisionProvider.createEmptyUri(changedPath, `before:${revisionLabel}`);
    await vscode.commands.executeCommand('vscode.diff', left, right, `${changedPath} (${revisionLabel})`);
  }
}

function firstLine(message: string): string {
  return message.split(/\r?\n/)[0] || '(no message)';
}

function showNoValidRevisionWarning(): void {
  vscode.window.showWarningMessage('No valid Bazaar revision is selected.');
}
