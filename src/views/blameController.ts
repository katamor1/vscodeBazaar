import * as path from 'node:path';
import * as vscode from 'vscode';
import type { BazaarClient } from '../bazaar/client';
import type { BazaarAnnotation, BazaarBranch, BazaarRevision, BazaarTag } from '../bazaar/types';
import type { BazaarGeneratedDocumentProvider } from '../scm/generatedDocumentProvider';
import type { BazaarRevisionDocumentProvider } from '../scm/revisionDocumentProvider';
import {
  type BlameDiffEditorTarget,
  type BlameDiffSide,
  createComparisonToWorkingFileTarget,
  createPreviousRevisionDiffTarget,
  createWorkingFileDiffTarget
} from './blameDiff';
import {
  branchTipRevisionSpec,
  manualRevisionSpec,
  tagRevisionSpec
} from './blamePicker';
import { annotationsForSelectedLines } from './blameSelection';
import { revisionSpecForBlameAnnotation } from './blameTarget';
import { findVisibleEditorByUri } from './visibleEditor';

interface CachedAnnotations {
  documentVersion: number;
  annotations: BazaarAnnotation[];
}

interface ActiveBlameContext {
  editor: vscode.TextEditor;
  relativePath: string;
  annotation: BazaarAnnotation;
  revisionSpec: string;
}

type RevisionPick =
  | { targetKind: 'manual'; label: string }
  | { targetKind: 'revision'; label: string; revision: BazaarRevision }
  | { targetKind: 'tag'; label: string; tag: BazaarTag }
  | { targetKind: 'branch'; label: string; branch: BazaarBranch };

type RevisionPickItem = vscode.QuickPickItem & RevisionPick;

export class BazaarBlameController implements vscode.Disposable, vscode.HoverProvider {
  private readonly decorationType = vscode.window.createTextEditorDecorationType({
    after: {
      margin: '0 0 0 2em',
      color: new vscode.ThemeColor('descriptionForeground')
    }
  });
  private enabled = false;
  private readonly cache = new Map<string, CachedAnnotations>();

  constructor(
    private readonly rootPath: string,
    private readonly client: BazaarClient,
    private readonly revisionProvider: BazaarRevisionDocumentProvider,
    private readonly generatedProvider: BazaarGeneratedDocumentProvider,
    private readonly output: vscode.OutputChannel
  ) {}

  async toggle(): Promise<void> {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      for (const editor of vscode.window.visibleTextEditors) {
        editor.setDecorations(this.decorationType, []);
      }
      return;
    }

    await this.update(vscode.window.activeTextEditor);
  }

  async refresh(): Promise<void> {
    this.cache.clear();
    await this.update(vscode.window.activeTextEditor);
  }

  async update(editor?: vscode.TextEditor): Promise<void> {
    if (!editor) {
      return;
    }

    if (!this.enabled || editor.document.uri.scheme !== 'file') {
      editor.setDecorations(this.decorationType, []);
      return;
    }

    const relativePath = this.relativePath(editor.document.uri);
    if (!relativePath) {
      editor.setDecorations(this.decorationType, []);
      return;
    }

    const annotations = await this.annotationsFor(editor.document, relativePath);
    const selectedAnnotations = annotationsForSelectedLines(annotations, editor.selections);
    const decorations = selectedAnnotations.map((annotation) => ({
      range: new vscode.Range(annotation.line - 1, Number.MAX_SAFE_INTEGER, annotation.line - 1, Number.MAX_SAFE_INTEGER),
      renderOptions: {
        after: {
          contentText: ` ${this.formatAnnotation(annotation)}`
        }
      }
    }));
    editor.setDecorations(this.decorationType, decorations);
  }

  async provideHover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined> {
    if (!this.enabled || document.uri.scheme !== 'file') {
      return undefined;
    }

    const relativePath = this.relativePath(document.uri);
    if (!relativePath) {
      return undefined;
    }

    const annotation = (await this.annotationsFor(document, relativePath))[position.line];
    if (!annotation) {
      return undefined;
    }

    const markdown = new vscode.MarkdownString([
      `Bazaar rev ${annotation.revno}`,
      `Author: ${annotation.author}`,
      annotation.date ? `Date: ${annotation.date}` : undefined,
      '',
      annotation.text
    ].filter(Boolean).join('\n\n'));
    return new vscode.Hover(markdown);
  }

  async showCommit(): Promise<void> {
    const context = await this.activeBlameContext();
    if (!context) {
      return;
    }

    const revision = await this.client.logRevision(context.revisionSpec);
    if (revision) {
      await vscode.commands.executeCommand('bazaar.history.showCommit', revision);
      return;
    }

    const document = await this.generatedProvider.openDocument(
      `Bazaar Blame Commit ${context.revisionSpec}`,
      `revno: ${context.revisionSpec}\nauthor: ${context.annotation.author}\ndate: ${context.annotation.date ?? ''}\n\n${context.annotation.text}`,
      'text'
    );
    await vscode.window.showTextDocument(document, { preview: true });
  }

  async showDiff(): Promise<void> {
    await this.openLineChangesWithPreviousRevision();
  }

  async openLineChangesWithPreviousRevision(): Promise<void> {
    await this.openPreviousRevisionDiff(true);
  }

  async openLineChangesWithWorkingFile(): Promise<void> {
    const context = await this.activeBlameContext();
    if (!context) {
      return;
    }

    const revision = await this.client.logRevision(context.revisionSpec);
    if (!revision) {
      vscode.window.showWarningMessage('Unable to load Bazaar revision metadata for the selected line.');
      return;
    }

    const diffTarget = createWorkingFileDiffTarget(revision, context.revisionSpec);
    if (!diffTarget) {
      showNoBlameRevisionWarning();
      return;
    }

    await this.openDiffTarget(context, diffTarget, context.annotation.line);
  }

  async openChangesWithPreviousRevision(): Promise<void> {
    await this.openPreviousRevisionDiff(false);
  }

  async openChangesWithRevision(): Promise<void> {
    const context = await this.activeBlameContext();
    if (!context) {
      return;
    }

    const picked = await this.pickRevisionForComparison();
    if (!picked) {
      return;
    }

    const diffTarget = createComparisonToWorkingFileTarget(picked.revisionSpec, picked.label);
    if (!diffTarget) {
      showNoBlameRevisionWarning();
      return;
    }

    await this.openDiffTarget(context, diffTarget);
  }

  async openChangesWithBranchOrTag(): Promise<void> {
    const context = await this.activeBlameContext();
    if (!context) {
      return;
    }

    const picked = await this.pickBranchOrTagForComparison();
    if (!picked) {
      return;
    }

    const diffTarget = createComparisonToWorkingFileTarget(picked.revisionSpec, picked.label);
    if (!diffTarget) {
      showNoBlameRevisionWarning();
      return;
    }

    await this.openDiffTarget(context, diffTarget);
  }

  async quickShowLineCommit(): Promise<void> {
    await this.showCommit();
  }

  async inspectLineCommitDetails(): Promise<void> {
    const context = await this.activeBlameContext();
    if (!context) {
      return;
    }

    const revision = await this.client.logRevision(context.revisionSpec);
    const document = await this.generatedProvider.openDocument(
      `Bazaar Line Commit ${context.revisionSpec}`,
      this.commitDetailsContent(context, revision),
      'text'
    );
    await vscode.window.showTextDocument(document, { preview: true });
  }

  async openPreviousRevisionDiff(revealLine: boolean): Promise<void> {
    const context = await this.activeBlameContext();
    if (!context) {
      return;
    }

    const revision = await this.client.logRevision(context.revisionSpec);
    if (!revision) {
      vscode.window.showWarningMessage('Unable to load Bazaar revision metadata for the selected line.');
      return;
    }

    const diffTarget = createPreviousRevisionDiffTarget(revision, context.revisionSpec);
    if (!diffTarget) {
      showNoBlameRevisionWarning();
      return;
    }

    await this.openDiffTarget(context, diffTarget, revealLine ? context.annotation.line : undefined);
  }

  async openFileAtRevision(): Promise<void> {
    const context = await this.activeBlameContext();
    if (!context) {
      return;
    }

    const uri = this.revisionProvider.createUriForPath(context.relativePath, context.revisionSpec);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, { preview: true });
  }

  dispose(): void {
    this.decorationType.dispose();
  }

  private async annotationAtActiveLine(): Promise<BazaarAnnotation | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme !== 'file') {
      return undefined;
    }
    const relativePath = this.relativePath(editor.document.uri);
    if (!relativePath) {
      return undefined;
    }
    return (await this.annotationsFor(editor.document, relativePath))[editor.selection.active.line];
  }

  private async activeBlameContext(): Promise<ActiveBlameContext | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme !== 'file') {
      return undefined;
    }

    const relativePath = this.relativePath(editor.document.uri);
    if (!relativePath) {
      return undefined;
    }

    const annotation = (await this.annotationsFor(editor.document, relativePath))[editor.selection.active.line];
    if (!annotation) {
      return undefined;
    }

    const revisionSpec = revisionSpecForBlameAnnotation(annotation);
    if (!revisionSpec) {
      showNoBlameRevisionWarning();
      return undefined;
    }

    return { editor, relativePath, annotation, revisionSpec };
  }

  private async openDiffTarget(
    context: ActiveBlameContext,
    target: BlameDiffEditorTarget,
    revealLine?: number
  ): Promise<void> {
    const left = this.uriForDiffSide(context, target.left);
    const right = this.uriForDiffSide(context, target.right);
    await vscode.commands.executeCommand('vscode.diff', left, right, `${context.relativePath} (${target.label})`);
    if (revealLine !== undefined) {
      await this.revealLineInVisibleEditor(right, revealLine);
    }
  }

  private uriForDiffSide(context: ActiveBlameContext, side: BlameDiffSide): vscode.Uri {
    if (side.kind === 'working') {
      return context.editor.document.uri;
    }
    if (side.kind === 'empty') {
      return this.revisionProvider.createEmptyUri(context.relativePath, side.revision);
    }
    return this.revisionProvider.createUriForPath(context.relativePath, side.revision);
  }

  private async revealLineInVisibleEditor(uri: vscode.Uri, line: number): Promise<void> {
    await Promise.resolve();
    const editor = findVisibleEditorByUri(vscode.window.visibleTextEditors, uri);
    if (!editor) {
      return;
    }
    const zeroBasedLine = Math.max(0, line - 1);
    const range = new vscode.Range(zeroBasedLine, 0, zeroBasedLine, 0);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  private async pickRevisionForComparison(): Promise<{ revisionSpec: string; label: string } | undefined> {
    const config = vscode.workspace.getConfiguration('bazaar');
    let revisions: BazaarRevision[] = [];
    try {
      revisions = await this.client.log({
        limit: Math.min(config.get<number>('history.limit', 200), 50),
        includeMerged: config.get<boolean>('history.includeMerged', true)
      });
    } catch (error) {
      this.output.appendLine(`Unable to load Bazaar revision choices: ${formatError(error)}`);
      vscode.window.showWarningMessage('Unable to load Bazaar revision choices. Enter a revision manually.');
    }
    const picks: RevisionPickItem[] = [
      { targetKind: 'manual', label: 'Enter Bazaar Revision...' },
      ...revisions.map((revision) => ({
        targetKind: 'revision' as const,
        label: revision.revno || revision.revisionId,
        description: firstLine(revision.message),
        detail: revision.timestamp,
        revision
      }))
    ];
    const picked = await vscode.window.showQuickPick(picks, {
      placeHolder: 'Choose a Bazaar revision to compare with the working file.'
    });
    return picked ? this.revisionSpecFromPick(picked) : undefined;
  }

  private async pickBranchOrTagForComparison(): Promise<{ revisionSpec: string; label: string } | undefined> {
    let tags: BazaarTag[] = [];
    let branches: BazaarBranch[] = [];
    try {
      const info = await this.client.info();
      [tags, branches] = await Promise.all([
        this.client.tags(),
        this.client.branches(info.repository ?? '.')
      ]);
    } catch (error) {
      this.output.appendLine(`Unable to load Bazaar branch or tag choices: ${formatError(error)}`);
      vscode.window.showWarningMessage('Unable to load Bazaar branch or tag choices. Enter a revision manually.');
    }
    const picks: RevisionPickItem[] = [
      { targetKind: 'manual', label: 'Enter Bazaar Revision, Branch, or Tag...' },
      ...tags.map((tag) => ({
        targetKind: 'tag' as const,
        label: tag.name,
        description: tag.revision,
        tag
      })),
      ...branches.map((branch) => ({
        targetKind: 'branch' as const,
        label: branch.name,
        description: branch.current ? 'current branch' : branch.path,
        branch
      }))
    ];
    const picked = await vscode.window.showQuickPick(picks, {
      placeHolder: 'Choose a Bazaar branch or tag to compare with the working file.'
    });
    return picked ? this.revisionSpecFromPick(picked) : undefined;
  }

  private async revisionSpecFromPick(picked: RevisionPickItem): Promise<{ revisionSpec: string; label: string } | undefined> {
    if (picked.targetKind === 'manual') {
      const input = await vscode.window.showInputBox({
        title: 'Bazaar Revision',
        prompt: 'Revision, revision id, tag:<name>, or other Bazaar revision spec.'
      });
      const revisionSpec = manualRevisionSpec(input);
      if (!revisionSpec && input !== undefined) {
        showNoBlameRevisionWarning();
      }
      return revisionSpec ? { revisionSpec, label: revisionSpec } : undefined;
    }

    if (picked.targetKind === 'revision') {
      const revisionSpec = branchTipRevisionSpec(picked.revision);
      return revisionSpec ? { revisionSpec, label: picked.label } : undefined;
    }

    if (picked.targetKind === 'tag') {
      const revisionSpec = tagRevisionSpec(picked.tag);
      return revisionSpec ? { revisionSpec, label: picked.label } : undefined;
    }

    let revisions: BazaarRevision[] = [];
    try {
      revisions = await this.client.log({ limit: 1, includeMerged: false, path: picked.branch.path });
    } catch (error) {
      this.output.appendLine(`Unable to resolve Bazaar branch ${picked.branch.name}: ${formatError(error)}`);
      vscode.window.showWarningMessage(`Unable to resolve Bazaar branch ${picked.branch.name}.`);
      return undefined;
    }
    const revisionSpec = revisions[0] ? branchTipRevisionSpec(revisions[0]) : undefined;
    if (!revisionSpec) {
      vscode.window.showWarningMessage(`Unable to resolve Bazaar branch ${picked.branch.name}.`);
      return undefined;
    }
    return { revisionSpec, label: picked.label };
  }

  private commitDetailsContent(context: ActiveBlameContext, revision?: BazaarRevision): string {
    const lines = [
      `file: ${context.relativePath}`,
      `line: ${context.annotation.line}`,
      `annotation-revno: ${context.annotation.revno}`,
      `annotation-author: ${context.annotation.author}`,
      context.annotation.date ? `annotation-date: ${context.annotation.date}` : undefined,
      '',
      revision ? `revno: ${revision.revno || '(unknown)'}` : `revno: ${context.revisionSpec}`,
      revision ? `revision-id: ${revision.revisionId || '(unknown)'}` : undefined,
      revision ? `committer: ${revision.committer}` : undefined,
      revision ? `branch: ${revision.branchNick}` : undefined,
      revision ? `timestamp: ${revision.timestamp}` : undefined,
      revision ? `parents: ${revision.parentIds.join(', ') || '(none)'}` : undefined,
      revision ? `tags: ${revision.tags.join(', ') || '(none)'}` : undefined,
      '',
      revision?.message ?? context.annotation.text,
      '',
      ...(revision?.changedPaths?.map((changedPath) => `* ${changedPath}`) ?? [])
    ];
    return lines.filter((line): line is string => line !== undefined).join('\n');
  }

  private async annotationsFor(document: vscode.TextDocument, relativePath: string): Promise<BazaarAnnotation[]> {
    const cacheKey = document.uri.toString();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.documentVersion === document.version) {
      return cached.annotations;
    }

    const annotations = await this.client.annotate(relativePath);
    this.cache.set(cacheKey, { documentVersion: document.version, annotations });
    return annotations;
  }

  private relativePath(uri: vscode.Uri): string | undefined {
    const relativePath = path.relative(this.rootPath, uri.fsPath).replace(/\\/g, '/');
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return undefined;
    }
    return relativePath;
  }

  private formatAnnotation(annotation: BazaarAnnotation): string {
    const format = vscode.workspace.getConfiguration('bazaar').get<string>('blame.enabledFormat', 'revAuthorDate');
    if (format === 'revAuthor') {
      return `${annotation.revno} ${annotation.author}`;
    }
    return [annotation.revno, annotation.author, annotation.date].filter(Boolean).join(' ');
  }
}

function showNoBlameRevisionWarning(): void {
  vscode.window.showWarningMessage('No valid Bazaar revision is available for the selected line.');
}

function firstLine(message: string): string {
  return message.split(/\r?\n/)[0] || '(no message)';
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
