import * as path from 'node:path';
import * as vscode from 'vscode';
import { BazaarClient, BazaarCommandError } from '../bazaar/client';
import { IncludedSet } from '../bazaar/staging';
import type { BazaarChange, BazaarCleanTreeKind, BazaarConflict, BazaarChangeKind } from '../bazaar/types';
import { groupWorkspaceState } from './model';
import { BazaarOriginalDocumentProvider } from './originalDocumentProvider';
import { expandUnknownDirectories } from '../bazaar/unknownExpansion';
import { confirmDangerousOperation } from '../views/confirmation';

type BazaarResourceData =
  | { type: 'change'; change: BazaarChange }
  | { type: 'conflict'; conflict: BazaarConflict };

export class BazaarResourceState implements vscode.SourceControlResourceState {
  readonly resourceUri: vscode.Uri;
  readonly command: vscode.Command;
  readonly contextValue: string;
  readonly decorations: vscode.SourceControlResourceDecorations;

  constructor(
    readonly rootPath: string,
    readonly data: BazaarResourceData
  ) {
    const relativePath = data.type === 'change' ? data.change.path : data.conflict.path;
    this.resourceUri = vscode.Uri.file(path.join(rootPath, relativePath));
    this.command = {
      command: 'bazaar.openResourceDiff',
      title: 'Open Bazaar Changes',
      arguments: [this]
    };
    this.contextValue = data.type === 'change' ? data.change.kind : 'conflict';
    this.decorations = data.type === 'change'
      ? decorationsForChange(data.change)
      : {
          tooltip: data.conflict.description,
          iconPath: new vscode.ThemeIcon('warning')
        };
  }

  get relativePath(): string {
    return this.data.type === 'change' ? this.data.change.path : this.data.conflict.path;
  }
}

export class BazaarScmProvider implements vscode.Disposable {
  readonly sourceControl: vscode.SourceControl;

  private readonly disposables: vscode.Disposable[] = [];
  private readonly includedSet = new IncludedSet();
  private readonly includedGroup: vscode.SourceControlResourceGroup;
  private readonly changesGroup: vscode.SourceControlResourceGroup;
  private readonly untrackedGroup: vscode.SourceControlResourceGroup;
  private readonly conflictsGroup: vscode.SourceControlResourceGroup;
  private currentChanges: BazaarChange[] = [];
  private currentConflicts: BazaarConflict[] = [];
  private previewedCleanTreeKinds: BazaarCleanTreeKind[] = [];
  private previewedUncommitRevision: string | undefined;

  constructor(
    private readonly rootPath: string,
    private readonly client: BazaarClient,
    private readonly originalProvider: BazaarOriginalDocumentProvider,
    private readonly output: vscode.OutputChannel
  ) {
    const rootUri = vscode.Uri.file(rootPath);
    this.sourceControl = vscode.scm.createSourceControl('bazaar', 'Bazaar', rootUri);
    this.sourceControl.inputBox.placeholder = 'Commit message for included Bazaar changes';
    this.sourceControl.acceptInputCommand = {
      command: 'bazaar.commit',
      title: 'Commit Included Changes'
    };
    this.sourceControl.quickDiffProvider = {
      provideOriginalResource: (uri) => this.provideOriginalResource(uri)
    };
    this.sourceControl.statusBarCommands = [
      { command: 'bazaar.pull', title: '$(cloud-download) Bazaar Pull' },
      { command: 'bazaar.push', title: '$(cloud-upload) Bazaar Push' }
    ];

    this.includedGroup = this.sourceControl.createResourceGroup('included', 'Included');
    this.changesGroup = this.sourceControl.createResourceGroup('changes', 'Changes');
    this.untrackedGroup = this.sourceControl.createResourceGroup('untracked', 'Untracked');
    this.conflictsGroup = this.sourceControl.createResourceGroup('conflicts', 'Conflicts');

    for (const group of [this.includedGroup, this.changesGroup, this.untrackedGroup, this.conflictsGroup]) {
      group.hideWhenEmpty = true;
    }

    this.disposables.push(
      this.sourceControl,
      this.includedGroup,
      this.changesGroup,
      this.untrackedGroup,
      this.conflictsGroup,
      vscode.commands.registerCommand('bazaar.refresh', () => this.refresh()),
      vscode.commands.registerCommand('bazaar.include', (resource?: BazaarResourceState) => this.include(resource)),
      vscode.commands.registerCommand('bazaar.uninclude', (resource?: BazaarResourceState) => this.uninclude(resource)),
      vscode.commands.registerCommand('bazaar.includeAll', () => this.includeAll()),
      vscode.commands.registerCommand('bazaar.revert', (resource?: BazaarResourceState) => this.revert(resource)),
      vscode.commands.registerCommand('bazaar.revertAll', () => this.revertAll()),
      vscode.commands.registerCommand('bazaar.commit', () => this.commit()),
      vscode.commands.registerCommand('bazaar.pull', () => this.pull()),
      vscode.commands.registerCommand('bazaar.push', () => this.push()),
      vscode.commands.registerCommand('bazaar.resolve', (resource?: BazaarResourceState) => this.resolve(resource)),
      vscode.commands.registerCommand('bazaar.resolveAuto', () => this.resolveAuto()),
      vscode.commands.registerCommand('bazaar.conflict.openMerge', (resource?: BazaarResourceState) => this.openConflictMerge(resource)),
      vscode.commands.registerCommand('bazaar.conflict.takeThis', (resource?: BazaarResourceState) => this.resolveConflictAction(resource, 'take-this')),
      vscode.commands.registerCommand('bazaar.conflict.takeOther', (resource?: BazaarResourceState) => this.resolveConflictAction(resource, 'take-other')),
      vscode.commands.registerCommand('bazaar.conflict.resolveAll', () => this.resolveAll()),
      vscode.commands.registerCommand('bazaar.cleanTree.preview', () => this.previewCleanTree()),
      vscode.commands.registerCommand('bazaar.cleanTree.run', () => this.runCleanTree()),
      vscode.commands.registerCommand('bazaar.uncommit.preview', () => this.previewUncommit()),
      vscode.commands.registerCommand('bazaar.uncommit.run', () => this.runUncommit()),
      vscode.commands.registerCommand('bazaar.lock.break', () => this.breakLock()),
      vscode.commands.registerCommand('bazaar.doctor', () => this.doctor()),
      vscode.commands.registerCommand('bazaar.openOutput', () => this.output.show()),
      vscode.commands.registerCommand('bazaar.openResourceDiff', (resource?: BazaarResourceState) => this.openResourceDiff(resource))
    );
  }

  async refresh(): Promise<void> {
    await this.runWithErrors('refresh', async () => {
      const [changes, conflicts] = await Promise.all([
        this.client.status(),
        this.client.conflicts()
      ]);
      const expandUnknowns = vscode.workspace.getConfiguration('bazaar').get<boolean>('unknown.expandDirectories', true);
      this.currentChanges = expandUnknowns ? await expandUnknownDirectories(this.rootPath, changes) : changes;
      this.currentConflicts = conflicts;
      this.includedSet.prune(this.currentChanges);
      this.updateGroups();
    });
  }

  async include(resource?: BazaarResourceState): Promise<void> {
    const change = this.changeFromResource(resource);
    if (!change) {
      return;
    }

    this.includedSet.include(change);
    this.updateGroups();
  }

  async uninclude(resource?: BazaarResourceState): Promise<void> {
    const change = this.changeFromResource(resource);
    if (!change) {
      return;
    }

    this.includedSet.uninclude(change);
    this.updateGroups();
  }

  async includeAll(): Promise<void> {
    const nonConflicting = groupWorkspaceState(this.currentChanges, this.currentConflicts, this.includedSet);
    this.includedSet.includeAll([...nonConflicting.changes, ...nonConflicting.untracked]);
    this.updateGroups();
  }

  async revert(resource?: BazaarResourceState): Promise<void> {
    const change = this.changeFromResource(resource);
    if (!change) {
      return;
    }

    const answer = await vscode.window.showWarningMessage(
      `Revert Bazaar changes in ${change.path}?`,
      { modal: true },
      'Revert'
    );
    if (answer !== 'Revert') {
      return;
    }

    await this.runWithProgress('revert', `Reverting ${change.path}`, async () => {
      await this.client.revert([change.path]);
      this.includedSet.uninclude(change);
      await this.refresh();
    });
  }

  async revertAll(): Promise<void> {
    if (!(await confirmDangerousOperation({ id: 'revert-all', label: 'Revert all Bazaar changes', target: this.rootPath }))) {
      return;
    }

    await this.runWithProgress('revert all', 'Reverting all Bazaar changes', async () => {
      await this.client.revertAll();
      this.includedSet.clear();
      await this.refresh();
    });
  }

  async commit(): Promise<void> {
    const message = this.sourceControl.inputBox.value.trim();
    if (!message) {
      vscode.window.showWarningMessage('Enter a Bazaar commit message first.');
      return;
    }

    const includedChanges = this.includedSet.getIncludedChanges(this.currentChanges);
    if (includedChanges.length === 0) {
      vscode.window.showWarningMessage('Include at least one Bazaar change before committing.');
      return;
    }

    await this.runWithProgress('commit', 'Committing included Bazaar changes', async () => {
      await this.client.prepareIncludedForCommit(includedChanges);
      await this.client.commit(message, includedChanges.map((change) => change.path));
      this.sourceControl.inputBox.value = '';
      this.includedSet.clear();
      await this.refresh();
    });
  }

  async pull(): Promise<void> {
    await this.runWithProgress('pull', 'Running Bazaar pull', async () => {
      await this.client.pull();
      await this.refresh();
    });
  }

  async push(): Promise<void> {
    await this.runWithProgress('push', 'Running Bazaar push', async () => {
      await this.client.push();
      await this.refresh();
    });
  }

  async resolve(resource?: BazaarResourceState): Promise<void> {
    if (!resource || resource.data.type !== 'conflict') {
      return;
    }

    const conflict = resource.data.conflict;
    const answer = await vscode.window.showWarningMessage(
      `Mark ${conflict.path} as resolved in Bazaar?`,
      { modal: true },
      'Resolve'
    );
    if (answer !== 'Resolve') {
      return;
    }

    await this.runWithProgress('resolve', `Resolving ${conflict.path}`, async () => {
      await this.client.resolve(conflict.path);
      await this.refresh();
    });
  }

  async openConflictMerge(resource?: BazaarResourceState): Promise<void> {
    if (!resource || resource.data.type !== 'conflict') {
      return;
    }
    await vscode.window.showTextDocument(resource.resourceUri, { preview: false });
    try {
      await vscode.commands.executeCommand('git.openMergeEditor', resource.resourceUri);
    } catch (error) {
      this.output.appendLine(`Unable to open VS Code merge editor for ${resource.relativePath}: ${formatError(error)}`);
    }
  }

  async resolveConflictAction(resource: BazaarResourceState | undefined, action: 'take-this' | 'take-other'): Promise<void> {
    if (!resource || resource.data.type !== 'conflict') {
      return;
    }

    const conflict = resource.data.conflict;
    const label = action === 'take-this' ? 'Resolve Bazaar conflict using this version' : 'Resolve Bazaar conflict using other version';
    if (!(await confirmDangerousOperation({ id: `resolve-${action}`, label, target: conflict.path }))) {
      return;
    }

    await this.runWithProgress(`resolve ${action}`, `Resolving ${conflict.path}`, async () => {
      await this.client.resolveConflict(conflict.path, action);
      await this.refresh();
    });
  }

  async resolveAll(): Promise<void> {
    if (!(await confirmDangerousOperation({ id: 'resolve-all', label: 'Resolve all Bazaar conflicts', target: this.rootPath }))) {
      return;
    }

    await this.runWithProgress('resolve all', 'Resolving all Bazaar conflicts', async () => {
      await this.client.resolveAll();
      await this.refresh();
    });
  }

  async resolveAuto(): Promise<void> {
    const answer = await vscode.window.showWarningMessage(
      'Run Bazaar auto-resolve for all conflicts?',
      { modal: true },
      'Auto Resolve'
    );
    if (answer !== 'Auto Resolve') {
      return;
    }

    await this.runWithProgress('resolve --auto', 'Running Bazaar auto-resolve', async () => {
      await this.client.resolveAuto();
      await this.refresh();
    });
  }

  async openResourceDiff(resource?: BazaarResourceState): Promise<void> {
    if (!resource || resource.data.type !== 'change') {
      return;
    }

    if (resource.data.change.kind === 'unknown') {
      await vscode.window.showTextDocument(resource.resourceUri);
      return;
    }

    const originalUri = this.originalProvider.createUriForPath(resource.data.change.path);
    const title = `${resource.data.change.path} (Bazaar)`;
    try {
      await vscode.commands.executeCommand('vscode.diff', originalUri, resource.resourceUri, title);
    } catch (error) {
      await this.showTextDiffFallback(resource.data.change.path, error);
    }
  }

  async previewCleanTree(): Promise<void> {
    const picked = await vscode.window.showQuickPick(
      [
        { label: 'unknown', picked: true },
        { label: 'ignored' },
        { label: 'detritus' }
      ] satisfies Array<vscode.QuickPickItem & { label: BazaarCleanTreeKind }>,
      {
        title: 'Preview Bazaar clean-tree',
        canPickMany: true,
        placeHolder: 'Choose file classes to preview'
      }
    );
    if (!picked || picked.length === 0) {
      return;
    }

    const kinds = picked.map((item) => item.label as BazaarCleanTreeKind);
    const candidates = await this.client.cleanTreeDryRun(kinds);
    this.previewedCleanTreeKinds = kinds;
    const content = candidates.length > 0
      ? candidates.map((candidate) => `${candidate.kind}\t${candidate.path}`).join('\n')
      : 'No clean-tree candidates.';
    const document = await vscode.workspace.openTextDocument({ content, language: 'text' });
    await vscode.window.showTextDocument(document, { preview: true });
  }

  async runCleanTree(): Promise<void> {
    if (this.previewedCleanTreeKinds.length === 0) {
      await this.previewCleanTree();
    }
    if (this.previewedCleanTreeKinds.length === 0) {
      return;
    }
    const target = this.previewedCleanTreeKinds.join(', ');
    if (!(await confirmDangerousOperation({ id: 'clean-tree', label: 'Clean Bazaar working tree', target }))) {
      return;
    }

    await this.runWithProgress('clean-tree', 'Cleaning Bazaar working tree', async () => {
      await this.client.cleanTreeRun(this.previewedCleanTreeKinds);
      this.previewedCleanTreeKinds = [];
      await this.refresh();
    });
  }

  async previewUncommit(): Promise<void> {
    const revision = await vscode.window.showInputBox({
      title: 'Preview Bazaar uncommit',
      prompt: 'Revision to leave the branch at. Leave empty to preview removing the last revision.'
    });
    if (revision === undefined) {
      return;
    }
    this.previewedUncommitRevision = revision.trim() || undefined;
    const content = await this.client.uncommitDryRun(this.previewedUncommitRevision);
    const document = await vscode.workspace.openTextDocument({ content, language: 'text' });
    await vscode.window.showTextDocument(document, { preview: true });
  }

  async runUncommit(): Promise<void> {
    if (this.previewedUncommitRevision === undefined) {
      await this.previewUncommit();
    }
    const target = this.previewedUncommitRevision ?? 'last revision';
    if (!(await confirmDangerousOperation({ id: 'uncommit', label: 'Uncommit Bazaar revision', target }))) {
      return;
    }

    await this.runWithProgress('uncommit', 'Running Bazaar uncommit', async () => {
      await this.client.uncommitRun(this.previewedUncommitRevision);
      this.previewedUncommitRevision = undefined;
      await this.refresh();
    });
  }

  async breakLock(): Promise<void> {
    const info = await this.client.infoText();
    const document = await vscode.workspace.openTextDocument({ content: info, language: 'text' });
    await vscode.window.showTextDocument(document, { preview: true });
    if (!(await confirmDangerousOperation({ id: 'break-lock', label: 'Break Bazaar lock', target: this.rootPath }))) {
      return;
    }

    await this.runWithProgress('break-lock', 'Breaking Bazaar lock', async () => {
      await this.client.breakLock('.');
      await this.refresh();
    });
  }

  async doctor(): Promise<void> {
    await this.runWithProgress('doctor', 'Running Bazaar diagnostics', async () => {
      const [info, check, textConflicts] = await Promise.all([
        this.client.infoText(),
        this.client.checkTree(),
        this.client.conflictsText()
      ]);
      this.output.appendLine('=== Bazaar info ===');
      this.output.appendLine(info.trimEnd());
      this.output.appendLine('=== Bazaar check ===');
      this.output.appendLine(check.trimEnd() || '(no output)');
      this.output.appendLine('=== Text conflicts ===');
      this.output.appendLine(textConflicts.length ? textConflicts.join('\n') : '(none)');
      this.output.show();
    });
  }

  dispose(): void {
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
  }

  private provideOriginalResource(uri: vscode.Uri): vscode.Uri | undefined {
    const relativePath = this.originalProvider.pathFromWorkspaceUri(uri);
    if (!relativePath) {
      return undefined;
    }

    const change = this.currentChanges.find((candidate) => candidate.path === relativePath);
    if (!change || change.kind === 'unknown') {
      return undefined;
    }

    return this.originalProvider.createUriForPath(relativePath);
  }

  private async showTextDiffFallback(relativePath: string, cause: unknown): Promise<void> {
    this.output.appendLine(`Unable to open VS Code diff for ${relativePath}: ${formatError(cause)}`);
    const diff = await this.client.diff(relativePath);
    this.output.appendLine(diff);
    this.output.show();
  }

  private updateGroups(): void {
    const groups = groupWorkspaceState(this.currentChanges, this.currentConflicts, this.includedSet);
    this.includedGroup.resourceStates = groups.included.map((change) => this.resourceForChange(change));
    this.changesGroup.resourceStates = groups.changes.map((change) => this.resourceForChange(change));
    this.untrackedGroup.resourceStates = groups.untracked.map((change) => this.resourceForChange(change));
    this.conflictsGroup.resourceStates = groups.conflicts.map((conflict) => this.resourceForConflict(conflict));
    this.sourceControl.count = groups.included.length + groups.changes.length + groups.untracked.length + groups.conflicts.length;
  }

  private resourceForChange(change: BazaarChange): BazaarResourceState {
    return new BazaarResourceState(this.rootPath, { type: 'change', change });
  }

  private resourceForConflict(conflict: BazaarConflict): BazaarResourceState {
    return new BazaarResourceState(this.rootPath, { type: 'conflict', conflict });
  }

  private changeFromResource(resource?: BazaarResourceState): BazaarChange | undefined {
    if (!resource || resource.data.type !== 'change') {
      return undefined;
    }
    return resource.data.change;
  }

  private async runWithProgress(label: string, title: string, task: () => Promise<void>): Promise<void> {
    await this.runWithErrors(label, () => Promise.resolve(vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.SourceControl,
        title
      },
      task
    )));
  }

  private async runWithErrors(label: string, task: () => Promise<void>): Promise<void> {
    this.output.appendLine(`bzr ${label}`);
    try {
      await task();
    } catch (error) {
      this.reportError(label, error);
    }
  }

  private reportError(label: string, error: unknown): void {
    if (error instanceof BazaarCommandError) {
      this.output.appendLine(`Command failed: bzr ${error.args.join(' ')}`);
      if (error.result.stdout) {
        this.output.appendLine(error.result.stdout.trimEnd());
      }
      if (error.result.stderr) {
        this.output.appendLine(error.result.stderr.trimEnd());
      }
    } else {
      this.output.appendLine(formatError(error));
    }

    this.output.show(true);
    vscode.window.showErrorMessage(`Bazaar ${label} failed. See Bazaar output for details.`);
  }
}

function decorationsForChange(change: BazaarChange): vscode.SourceControlResourceDecorations {
  const iconPath = new vscode.ThemeIcon(iconForKind(change.kind));
  return {
    tooltip: labelForKind(change.kind),
    strikeThrough: change.kind === 'removed',
    iconPath
  };
}

function iconForKind(kind: BazaarChangeKind): string {
  switch (kind) {
    case 'added':
      return 'add';
    case 'removed':
      return 'remove';
    case 'renamed':
      return 'arrow-right';
    case 'unknown':
      return 'question';
    case 'modified':
    default:
      return 'edit';
  }
}

function labelForKind(kind: BazaarChangeKind): string {
  switch (kind) {
    case 'added':
      return 'Added in Bazaar';
    case 'removed':
      return 'Removed in Bazaar';
    case 'renamed':
      return 'Renamed in Bazaar';
    case 'unknown':
      return 'Unknown to Bazaar';
    case 'modified':
    default:
      return 'Modified in Bazaar';
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
