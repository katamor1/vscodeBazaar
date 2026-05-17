import * as path from 'node:path';
import * as vscode from 'vscode';
import { BazaarClient, BazaarCommandError, isPullDivergedError } from '../bazaar/client';
import { resolveTextConflictMarkers, type TextConflictResolution } from '../bazaar/conflictMarkers';
import { IncludedSet } from '../bazaar/staging';
import type { BazaarChange, BazaarCleanTreeKind, BazaarConflict, BazaarChangeKind, BazaarConflictAction } from '../bazaar/types';
import { groupWorkspaceState } from './model';
import type { BazaarGeneratedDocumentProvider } from './generatedDocumentProvider';
import { BazaarOriginalDocumentProvider } from './originalDocumentProvider';
import { expandUnknownDirectories } from '../bazaar/unknownExpansion';
import { confirmDangerousOperation } from '../views/confirmation';
import { pendingMergeForgetPrompt } from './pendingMerge';
import { createResourceOpenCommand } from './resourceCommand';

type BazaarResourceData =
  | { type: 'change'; change: BazaarChange }
  | { type: 'conflict'; conflict: BazaarConflict };

type ConflictResolutionAction =
  | Extract<BazaarConflictAction, 'take-this' | 'take-other'>
  | 'take-both-this-first'
  | 'take-both-this-last';

interface PreviewedUncommit {
  revision?: string;
  targetLabel: string;
}

export class BazaarResourceState implements vscode.SourceControlResourceState {
  readonly resourceUri: vscode.Uri;
  readonly command: vscode.Command;
  readonly contextValue: string;
  readonly decorations: vscode.SourceControlResourceDecorations;

  constructor(
    readonly rootPath: string,
    readonly data: BazaarResourceData,
    commandForResource?: (resourceUri: vscode.Uri) => vscode.Command
  ) {
    const relativePath = data.type === 'change' ? data.change.path : data.conflict.path;
    this.resourceUri = data.type === 'change' && data.change.kind === 'pendingMerge'
      ? vscode.Uri.from({ scheme: 'bazaar-pending-merge', path: '/Pending merge' })
      : vscode.Uri.file(path.join(rootPath, relativePath));
    this.command = commandForResource?.(this.resourceUri) ?? {
      command: 'vscode.open',
      title: 'Bazaar ファイルを開く',
      arguments: [this.resourceUri]
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
  private previewedUncommit: PreviewedUncommit | undefined;

  constructor(
    private readonly rootPath: string,
    private readonly client: BazaarClient,
    private readonly originalProvider: BazaarOriginalDocumentProvider,
    private readonly generatedProvider: BazaarGeneratedDocumentProvider,
    private readonly output: vscode.OutputChannel,
    private readonly afterCommit?: () => Promise<void> | void
  ) {
    const rootUri = vscode.Uri.file(rootPath);
    this.sourceControl = vscode.scm.createSourceControl('bazaar', 'Bazaar', rootUri);
    this.sourceControl.inputBox.placeholder = 'コミット対象の Bazaar 変更に使うコミットメッセージ';
    this.sourceControl.acceptInputCommand = {
      command: 'bazaar.commit',
      title: 'コミット対象の変更をコミット'
    };
    this.sourceControl.quickDiffProvider = {
      provideOriginalResource: (uri) => this.provideOriginalResource(uri)
    };
    this.sourceControl.statusBarCommands = [
      { command: 'bazaar.pull', title: '$(cloud-download) Bazaar Pull' },
      { command: 'bazaar.push', title: '$(cloud-upload) Bazaar Push' }
    ];

    this.includedGroup = this.sourceControl.createResourceGroup('included', 'コミット対象');
    this.changesGroup = this.sourceControl.createResourceGroup('changes', '変更');
    this.untrackedGroup = this.sourceControl.createResourceGroup('untracked', '未追跡');
    this.conflictsGroup = this.sourceControl.createResourceGroup('conflicts', '競合');

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
      vscode.commands.registerCommand('bazaar.merge.forgetPending', (resource?: BazaarResourceState) => this.forgetPendingMerges(resource)),
      vscode.commands.registerCommand('bazaar.commit', () => this.commit()),
      vscode.commands.registerCommand('bazaar.pull', () => this.pull()),
      vscode.commands.registerCommand('bazaar.push', () => this.push()),
      vscode.commands.registerCommand('bazaar.resolve', (resource?: BazaarResourceState) => this.resolve(resource)),
      vscode.commands.registerCommand('bazaar.resolveAuto', () => this.resolveAuto()),
      vscode.commands.registerCommand('bazaar.conflict.openMerge', (resource?: BazaarResourceState) => this.openConflictMerge(resource)),
      vscode.commands.registerCommand('bazaar.conflict.takeThis', (resource?: BazaarResourceState) => this.resolveConflictAction(resource, 'take-this')),
      vscode.commands.registerCommand('bazaar.conflict.takeOther', (resource?: BazaarResourceState) => this.resolveConflictAction(resource, 'take-other')),
      vscode.commands.registerCommand('bazaar.conflict.takeBothThisFirst', (resource?: BazaarResourceState) => this.resolveConflictAction(resource, 'take-both-this-first')),
      vscode.commands.registerCommand('bazaar.conflict.takeBothThisLast', (resource?: BazaarResourceState) => this.resolveConflictAction(resource, 'take-both-this-last')),
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
    if (isPendingMergeChange(change)) {
      await this.forgetPendingMerges(resource);
      return;
    }

    const answer = await vscode.window.showWarningMessage(
      `${change.path} の Bazaar 変更を Revert しますか?`,
      { modal: true },
      'Revert'
    );
    if (answer !== 'Revert') {
      return;
    }

    await this.runWithProgress('revert', `${change.path} を Revert 中`, async () => {
      await this.client.revert([change.path]);
      this.includedSet.uninclude(change);
      await this.refresh();
    });
  }

  async revertAll(): Promise<void> {
    if (!(await confirmDangerousOperation({ id: 'revert-all', label: 'すべての Bazaar 変更と pending merge 状態を Revert', target: this.rootPath }))) {
      return;
    }

    await this.runWithProgress('revert all', 'すべての Bazaar 変更を Revert 中', async () => {
      await this.client.revertAll();
      this.includedSet.clear();
      await this.refresh();
    });
  }

  async forgetPendingMerges(resource?: BazaarResourceState): Promise<void> {
    const pendingMerge = pendingMergeChangeFromResource(resource) ?? this.currentChanges.find(isPendingMergeChange);
    const prompt = pendingMergeForgetPrompt(pendingMerge, this.rootPath);
    const answer = await vscode.window.showWarningMessage(
      prompt.message,
      { modal: true, detail: prompt.detail },
      'Pending Merge をクリア'
    );
    if (answer !== 'Pending Merge をクリア') {
      return;
    }

    await this.runWithProgress('revert --forget-merges', 'Bazaar の pending merge 状態をクリア中', async () => {
      await this.client.forgetMerges();
      await this.refresh();
    });
  }

  async commit(): Promise<void> {
    const message = this.sourceControl.inputBox.value.trim();
    if (!message) {
      vscode.window.showWarningMessage('先に Bazaar のコミットメッセージを入力してください。');
      return;
    }

    const includedChanges = this.includedSet.getIncludedChanges(this.currentChanges);
    if (includedChanges.length === 0) {
      vscode.window.showWarningMessage('コミット前に 1 件以上の Bazaar 変更をコミット対象へ含めてください。');
      return;
    }
    const includesPendingMerge = includedChanges.some(isPendingMergeChange);
    if (includesPendingMerge) {
      const answer = await vscode.window.showWarningMessage(
        'Bazaar の pending merge 状態をコミットしますか? Bazaar のマージコミットはツリー全体のコミットになるため、ファイルリストなしで bzr commit を実行します。',
        { modal: true },
        'マージをコミット'
      );
      if (answer !== 'マージをコミット') {
        return;
      }
    }

    await this.runWithProgress('commit', 'コミット対象の Bazaar 変更をコミット中', async () => {
      const fileChanges = includedChanges.filter((change) => !isPendingMergeChange(change));
      await this.client.prepareIncludedForCommit(fileChanges);
      await this.client.commit(
        message,
        includesPendingMerge ? [] : fileChanges.map((change) => change.path),
        { wholeTree: includesPendingMerge }
      );
      this.sourceControl.inputBox.value = '';
      this.includedSet.clear();
      await this.refresh();
      await this.afterCommit?.();
    });
  }

  async pull(): Promise<void> {
    await this.runWithProgress('pull', 'Bazaar pull を実行中', async () => {
      try {
        await this.client.pull();
        await this.refresh();
      } catch (error) {
        if (!isPullDivergedError(error)) {
          throw error;
        }
        await this.handleDivergedPull(error);
      }
    });
  }

  async push(): Promise<void> {
    await this.runWithProgress('push', 'Bazaar push を実行中', async () => {
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
      `${conflict.path} を Bazaar で解決済みとしてマークしますか?`,
      { modal: true },
      '解決済みにする'
    );
    if (answer !== '解決済みにする') {
      return;
    }

    await this.runWithProgress('resolve', `${conflict.path} を解決中`, async () => {
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
      this.output.appendLine(`${resource.relativePath} を VS Code マージエディターで開けませんでした: ${formatError(error)}`);
    }
  }

  async resolveConflictAction(resource: BazaarResourceState | undefined, action: ConflictResolutionAction): Promise<void> {
    if (!resource || resource.data.type !== 'conflict') {
      return;
    }

    const conflict = resource.data.conflict;
    await this.runWithProgress(`resolve ${action}`, `${conflict.path} を解決中`, async () => {
      if (action === 'take-this' || action === 'take-other') {
        await this.client.resolveConflict(conflict.path, action);
      } else if (await this.applyTextConflictResolution(resource.resourceUri, action)) {
        await this.client.resolve(conflict.path);
      } else {
        vscode.window.showWarningMessage(`${conflict.path} にテキスト競合マーカーが見つかりませんでした。マージエディターで開くか手動で解決してください。`);
        return;
      }
      await this.refresh();
    });
  }

  private async applyTextConflictResolution(resourceUri: vscode.Uri, action: Extract<ConflictResolutionAction, 'take-both-this-first' | 'take-both-this-last'>): Promise<boolean> {
    const document = await vscode.workspace.openTextDocument(resourceUri);
    const resolution = textResolutionForAction(action);
    const resolved = resolveTextConflictMarkers(document.getText(), resolution);
    if (resolved.resolvedCount === 0) {
      return false;
    }

    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
    edit.replace(document.uri, fullRange, resolved.content);
    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
      throw new Error(`${document.uri.fsPath} を更新できませんでした。`);
    }
    const saved = await document.save();
    if (!saved) {
      throw new Error(`${document.uri.fsPath} を保存できませんでした。`);
    }
    return true;
  }

  async resolveAll(): Promise<void> {
    if (!(await confirmDangerousOperation({ id: 'resolve-all', label: 'すべての Bazaar 競合を解決', target: this.rootPath }))) {
      return;
    }

    await this.runWithProgress('resolve all', 'すべての Bazaar 競合を解決中', async () => {
      await this.client.resolveAll();
      await this.refresh();
    });
  }

  async resolveAuto(): Promise<void> {
    const answer = await vscode.window.showWarningMessage(
      'すべての競合に Bazaar の自動解決を実行しますか?',
      { modal: true },
      '自動解決'
    );
    if (answer !== '自動解決') {
      return;
    }

    await this.runWithProgress('resolve --auto', 'Bazaar 自動解決を実行中', async () => {
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
        { label: '未追跡', description: 'unknown', cleanTreeKind: 'unknown', picked: true },
        { label: '無視対象', description: 'ignored', cleanTreeKind: 'ignored' },
        { label: '一時ファイル', description: 'detritus', cleanTreeKind: 'detritus' }
      ] satisfies Array<vscode.QuickPickItem & { cleanTreeKind: BazaarCleanTreeKind }>,
      {
        title: 'Bazaar clean-tree のプレビュー',
        canPickMany: true,
        placeHolder: 'プレビューするファイル分類を選択'
      }
    );
    if (!picked || picked.length === 0) {
      return;
    }

    const kinds = picked.map((item) => item.cleanTreeKind);
    const candidates = await this.client.cleanTreeDryRun(kinds);
    this.previewedCleanTreeKinds = kinds;
    const content = candidates.length > 0
      ? candidates.map((candidate) => `${candidate.kind}\t${candidate.path}`).join('\n')
      : 'clean-tree の候補はありません。';
    const document = await this.generatedProvider.openDocument('Bazaar clean-tree プレビュー', content, 'text');
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
    if (!(await confirmDangerousOperation({ id: 'clean-tree', label: 'Bazaar 作業ツリーを clean-tree', target }))) {
      return;
    }

    await this.runWithProgress('clean-tree', 'Bazaar 作業ツリーを clean-tree 中', async () => {
      await this.client.cleanTreeRun(this.previewedCleanTreeKinds);
      this.previewedCleanTreeKinds = [];
      await this.refresh();
    });
  }

  async previewUncommit(): Promise<boolean> {
    const revision = await vscode.window.showInputBox({
      title: 'Bazaar uncommit のプレビュー',
      prompt: 'ブランチに残すリビジョン。空欄の場合は最後のリビジョン削除をプレビューします。'
    });
    if (revision === undefined) {
      return false;
    }
    const revisionSpec = revision.trim() || undefined;
    const content = await this.client.uncommitDryRun(revisionSpec);
    this.previewedUncommit = {
      revision: revisionSpec,
      targetLabel: revisionSpec ?? '最後のリビジョン'
    };
    const document = await this.generatedProvider.openDocument('Bazaar uncommit プレビュー', content, 'text');
    await vscode.window.showTextDocument(document, { preview: true });
    return true;
  }

  async runUncommit(): Promise<void> {
    if (!this.previewedUncommit) {
      const previewed = await this.previewUncommit();
      if (!previewed) {
        return;
      }
    }
    const previewedUncommit = this.previewedUncommit;
    if (!previewedUncommit) {
      return;
    }
    const target = previewedUncommit.targetLabel;
    if (!(await confirmDangerousOperation({ id: 'uncommit', label: 'Bazaar リビジョンを uncommit', target }))) {
      return;
    }

    await this.runWithProgress('uncommit', 'Bazaar uncommit を実行中', async () => {
      await this.client.uncommitRun(previewedUncommit.revision);
      this.previewedUncommit = undefined;
      await this.refresh();
    });
  }

  async breakLock(): Promise<void> {
    const info = await this.client.infoText();
    const document = await this.generatedProvider.openDocument('Bazaar 作業ツリー情報', info, 'text');
    await vscode.window.showTextDocument(document, { preview: true });
    if (!(await confirmDangerousOperation({ id: 'break-lock', label: 'Bazaar ロックを解除', target: this.rootPath }))) {
      return;
    }

    await this.runWithProgress('break-lock', 'Bazaar ロックを解除中', async () => {
      await this.client.breakLock('.');
      await this.refresh();
    });
  }

  async doctor(): Promise<void> {
    await this.runWithProgress('doctor', 'Bazaar 診断を実行中', async () => {
      const [info, check, textConflicts] = await Promise.all([
        this.client.infoText(),
        this.client.checkTree(),
        this.client.conflictsText()
      ]);
      this.output.appendLine('=== Bazaar 情報 ===');
      this.output.appendLine(info.trimEnd());
      this.output.appendLine('=== Bazaar check ===');
      this.output.appendLine(check.trimEnd() || '(出力なし)');
      this.output.appendLine('=== テキスト競合 ===');
      this.output.appendLine(textConflicts.length ? textConflicts.join('\n') : '(なし)');
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
    this.output.appendLine(`${relativePath} を VS Code 差分エディターで開けませんでした: ${formatError(cause)}`);
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
    return new BazaarResourceState(this.rootPath, { type: 'change', change }, (resourceUri) =>
      createResourceOpenCommand(change, resourceUri, this.originalProvider.createUriForPath(change.path))
    );
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
    this.output.appendLine(`=== Bazaar 操作: ${label} ===`);
    try {
      await task();
    } catch (error) {
      this.reportError(label, error);
    }
  }

  private reportError(label: string, error: unknown): void {
    if (error instanceof BazaarCommandError) {
      this.appendCommandError(error);
    } else {
      this.output.appendLine(formatError(error));
    }

    this.output.show(true);
    vscode.window.showErrorMessage(`Bazaar ${label} に失敗しました。詳細は Bazaar 出力を確認してください。`);
  }

  private async handleDivergedPull(error: unknown): Promise<void> {
    if (error instanceof BazaarCommandError) {
      this.output.appendLine('Bazaar pull は、親ブランチと現在のブランチが分岐しているため停止しました。');
      this.appendCommandError(error);
    }

    const action = await vscode.window.showWarningMessage(
      'ブランチが分岐しているため Bazaar pull を続行できません。Bazaar merge で差分を統合してください。',
      '親ブランチをマージ',
      '未取得/未反映を表示',
      '出力を開く'
    );

    if (action === '親ブランチをマージ') {
      try {
        await this.client.mergeParent();
        await this.refresh();
        vscode.window.showInformationMessage('Bazaar merge が完了しました。必要に応じて競合を解決し、マージをコミットしてください。');
      } catch (mergeError) {
        this.reportError('merge', mergeError);
      }
      return;
    }

    if (action === '未取得/未反映を表示') {
      try {
        const content = await this.client.missing();
        const document = await this.generatedProvider.openDocument(
          'Bazaar 未取得/未反映リビジョン',
          content.trimEnd() || 'Bazaar は未取得/未反映リビジョンなしと報告しました。',
          'text'
        );
        await vscode.window.showTextDocument(document, { preview: true });
      } catch (missingError) {
        this.reportError('missing', missingError);
      }
      return;
    }

    if (action === '出力を開く') {
      this.output.show(true);
    }
  }

  private appendCommandError(error: BazaarCommandError): void {
    this.output.appendLine(`コマンド失敗: bzr ${error.args.join(' ')}`);
    if (error.result.stdout) {
      this.output.appendLine(error.result.stdout.trimEnd());
    }
    if (error.result.stderr) {
      this.output.appendLine(error.result.stderr.trimEnd());
    }
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
    case 'pendingMerge':
      return 'git-merge';
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
      return 'Bazaar で追加';
    case 'removed':
      return 'Bazaar で削除';
    case 'renamed':
      return 'Bazaar で名前変更';
    case 'pendingMerge':
      return 'Bazaar の pending merge';
    case 'unknown':
      return 'Bazaar で未追跡';
    case 'modified':
    default:
      return 'Bazaar で変更';
  }
}

function isPendingMergeChange(change: BazaarChange): boolean {
  return change.kind === 'pendingMerge';
}

function pendingMergeChangeFromResource(resource: BazaarResourceState | undefined): BazaarChange | undefined {
  if (!resource || resource.data.type !== 'change' || !isPendingMergeChange(resource.data.change)) {
    return undefined;
  }
  return resource.data.change;
}

function textResolutionForAction(action: Extract<ConflictResolutionAction, 'take-both-this-first' | 'take-both-this-last'>): TextConflictResolution {
  return action === 'take-both-this-first' ? 'both-this-first' : 'both-this-last';
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
