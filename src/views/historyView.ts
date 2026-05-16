import * as vscode from 'vscode';
import type { BazaarClient } from '../bazaar/client';
import { searchRevisions } from '../bazaar/historyParser';
import { normalizeRevisionSpec } from '../bazaar/revisionSpec';
import type { BazaarRevision } from '../bazaar/types';
import type { BazaarGeneratedDocumentProvider } from '../scm/generatedDocumentProvider';
import { BazaarRevisionDocumentProvider } from '../scm/revisionDocumentProvider';
import {
  type HistoryCommitDiffPlan,
  createHistoryCommitDiffPlan
} from './historyDiff';
import { resolveFileHistoryTarget } from './historyFile';
import {
  resolveRevisionCommandTarget,
  revisionDisplayLabel,
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
    private readonly generatedProvider: BazaarGeneratedDocumentProvider,
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
    const target = resolveFileHistoryTarget(
      this.rootPath,
      uri,
      vscode.window.activeTextEditor?.document.uri
    );
    if ('warning' in target) {
      vscode.window.showWarningMessage(target.warning);
      return;
    }

    await this.refresh(target.relativePath);
    await vscode.commands.executeCommand('bazaarHistory.focus');
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

    const document = await this.generatedProvider.openDocument(
      `Bazaar Commit ${revisionDisplayLabel(revision)}`,
      content,
      'text'
    );
    await vscode.window.showTextDocument(document, { preview: true });
  }

  async showCommitDiff(target?: unknown, changedPath?: string): Promise<void> {
    const revision = resolveRevisionCommandTarget(target);
    if (!revision) {
      showNoValidRevisionWarning();
      return;
    }
    const plan = createHistoryCommitDiffPlan(revision, changedPath);
    if (!plan) {
      showNoValidRevisionWarning();
      return;
    }

    if (plan.kind === 'fileDiff') {
      await this.openRevisionDiff(plan);
      return;
    }

    await this.openCommitDiffDocument(plan);
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

  private async openRevisionDiff(plan: Extract<HistoryCommitDiffPlan, { kind: 'fileDiff' }>): Promise<void> {
    const right = this.revisionProvider.createUriForPath(plan.changedPath, plan.rightRevision);
    const left = plan.leftEmpty
      ? this.revisionProvider.createEmptyUri(plan.changedPath, plan.leftRevision)
      : this.revisionProvider.createUriForPath(plan.changedPath, plan.leftRevision);
    await vscode.commands.executeCommand('vscode.diff', left, right, plan.title);
  }

  private async openCommitDiffDocument(plan: Extract<HistoryCommitDiffPlan, { kind: 'patchDocument' }>): Promise<void> {
    const diff = await this.client.diffChange(plan.revisionSpec, plan.changedPath);
    const document = await this.generatedProvider.openDocument(
      plan.title,
      diff.trimEnd() || '(no diff)',
      'diff'
    );
    await vscode.window.showTextDocument(document, { preview: true });
  }
}

function firstLine(message: string): string {
  return message.split(/\r?\n/)[0] || '(no message)';
}

function showNoValidRevisionWarning(): void {
  vscode.window.showWarningMessage('No valid Bazaar revision is selected.');
}
