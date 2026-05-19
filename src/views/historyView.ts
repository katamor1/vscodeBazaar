import * as vscode from 'vscode';
import type { BazaarClient } from '../bazaar/client';
import { searchRevisions } from '../bazaar/historyParser';
import { decodeBazaarPatchOutput } from '../bazaar/outputEncoding';
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
import { BazaarRevisionCache } from './revisionCache';
import { createHistoryEditorPayload, type HistoryEditorPayload } from './historyEditorModel';
import { clearHistoryFilters } from './historyFilters';

type HistoryNode =
  | { type: 'revision'; revision: BazaarRevision }
  | { type: 'detail'; label: string; description?: string; icon?: string; command?: vscode.Command };

type HistoryEditorMessage =
  | { command: 'refresh' }
  | { command: 'loadMore' }
  | { command: 'showCommit'; revisionId?: unknown }
  | { command: 'showDiff'; revisionId?: unknown; path?: unknown }
  | { command: 'openFile'; revisionId?: unknown; path?: unknown };

export class BazaarHistoryView implements vscode.TreeDataProvider<HistoryNode>, vscode.Disposable {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<HistoryNode | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private panel: vscode.WebviewPanel | undefined;
  private revisions: BazaarRevision[] = [];
  private visibleRevisions: BazaarRevision[] = [];
  private query = '';
  private pathFilter: string | undefined;
  private loaded = false;
  private loading = false;
  private currentLimit = 0;

  constructor(
    private readonly rootPath: string,
    private readonly client: BazaarClient,
    private readonly revisionCache: BazaarRevisionCache,
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
        title: 'Bazaar コミットを表示',
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
      if (!this.loaded) {
        void this.ensureLoaded();
        return [{ type: 'detail', label: this.loading ? 'Bazaar 履歴を読み込み中...' : 'Bazaar 履歴はまだ読み込まれていません。', icon: 'loading' }];
      }
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
          title: 'Bazaar リビジョン ID をコピー',
          arguments: [revision]
        }
      },
      { type: 'detail', label: `ブランチ: ${revision.branchNick || '(不明)'}`, icon: 'git-branch' }
    ];

    if (revision.tags.length > 0) {
      details.push({ type: 'detail', label: `タグ: ${revision.tags.join(', ')}`, icon: 'tag' });
    }
    if (revision.parentIds.length > 0) {
      details.push({ type: 'detail', label: `親: ${revision.parentIds.join(', ')}`, icon: 'references' });
    }
    for (const changedPath of revision.changedPaths ?? []) {
      details.push({
        type: 'detail',
        label: changedPath,
        icon: 'file',
        command: {
          command: 'bazaar.history.showCommitDiff',
          title: 'Bazaar コミット差分を表示',
          arguments: [revision, changedPath]
        }
      });
      details.push({
        type: 'detail',
        label: `${changedPath} を ${revisionDisplayLabel(revision)} で開く`,
        icon: 'go-to-file',
        command: {
          command: 'bazaar.history.openFileAtRevision',
          title: '指定リビジョンの Bazaar ファイルを開く',
          arguments: [revision, changedPath]
        }
      });
    }
    details.push({
      type: 'detail',
      label: 'コミット差分を表示',
      icon: 'diff',
      command: {
        command: 'bazaar.history.showCommitDiff',
        title: 'Bazaar コミット差分を表示',
        arguments: [revision]
      }
    });

    return details;
  }

  async refresh(pathFilter?: string): Promise<void> {
    this.pathFilter = pathFilter;
    this.revisionCache.invalidate();
    this.currentLimit = this.historyPageSize();
    await this.load(pathFilter, this.currentLimit);
  }

  async ensureLoaded(): Promise<void> {
    if (this.loaded || this.loading) {
      return;
    }
    await this.load(this.pathFilter);
  }

  invalidate(): void {
    this.loaded = false;
    this.revisions = [];
    this.visibleRevisions = [];
    this.currentLimit = 0;
    this.revisionCache.invalidate();
    this.onDidChangeTreeDataEmitter.fire(undefined);
    void this.postEditorData();
  }

  async loadMore(): Promise<void> {
    const pageSize = this.historyPageSize();
    this.currentLimit = Math.max(pageSize, this.currentLimit || pageSize) + pageSize;
    this.revisionCache.invalidate();
    await this.load(this.pathFilter, this.currentLimit);
  }

  openEditor(): void {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'bazaarHistoryEditor',
        'Bazaar 履歴',
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });
      this.configureEditorPanel(this.panel);
    }
    this.panel.reveal(vscode.ViewColumn.Active);
    if (!this.loaded && !this.loading) {
      void this.ensureLoaded();
    } else {
      void this.postEditorData();
    }
  }

  private async load(pathFilter?: string, limit = this.currentLimit || this.historyPageSize()): Promise<void> {
    this.loading = true;
    this.onDidChangeTreeDataEmitter.fire(undefined);
    void this.postEditorData();
    const config = vscode.workspace.getConfiguration('bazaar');
    const includeMerged = config.get<boolean>('history.includeMerged', true);
    this.currentLimit = Math.max(1, limit);
    try {
      this.revisions = await this.revisionCache.get({ limit: this.currentLimit, includeMerged, path: pathFilter });
      this.visibleRevisions = this.query ? searchRevisions(this.revisions, this.query) : this.revisions;
      this.loaded = true;
    } catch (error) {
      this.output.appendLine(`Bazaar 履歴を読み込めませんでした: ${formatError(error)}`);
      throw error;
    } finally {
      this.loading = false;
      this.onDidChangeTreeDataEmitter.fire(undefined);
      void this.postEditorData();
    }
  }

  async search(): Promise<void> {
    await this.ensureLoaded();
    const query = await vscode.window.showInputBox({
      title: 'Bazaar 履歴を検索',
      value: this.query,
      prompt: 'revno、リビジョン ID、メッセージ、作者、タグ、ブランチ、変更パスを検索します。'
    });
    if (query === undefined) {
      return;
    }

    this.query = query.trim();
    this.visibleRevisions = this.query ? searchRevisions(this.revisions, this.query) : this.revisions;
    if (this.query && this.visibleRevisions.length === 0) {
      const config = vscode.workspace.getConfiguration('bazaar');
      this.revisions = await this.revisionCache.get({
        limit: this.currentLimit || config.get<number>('history.limit', 200),
        includeMerged: config.get<boolean>('history.includeMerged', true),
        path: this.pathFilter,
        match: this.query
      });
      this.visibleRevisions = this.revisions;
    }
    this.onDidChangeTreeDataEmitter.fire(undefined);
    await this.postEditorData();
  }

  async clearFileFilter(): Promise<void> {
    const filters = clearHistoryFilters({
      query: this.query,
      pathFilter: this.pathFilter
    });
    this.query = filters.query;
    await this.refresh(filters.pathFilter);
  }

  async copyRevisionId(target?: unknown): Promise<void> {
    const revision = resolveRevisionCommandTarget(target);
    if (!revision) {
      showNoValidRevisionWarning();
      return;
    }
    const revisionId = normalizeRevisionSpec(revision.revisionId);
    if (!revisionId) {
      vscode.window.showWarningMessage('選択した Bazaar リビジョンにはリビジョン ID がありません。');
      return;
    }
    await vscode.env.clipboard.writeText(revisionId);
    vscode.window.showInformationMessage(`Bazaar リビジョン ID ${revisionId} をコピーしました。`);
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
      `revno: ${normalizeRevisionSpec(revision.revno) ?? '(不明)'}`,
      `revision-id: ${normalizeRevisionSpec(revision.revisionId) ?? '(不明)'}`,
      `committer: ${revision.committer}`,
      `branch: ${revision.branchNick}`,
      `timestamp: ${revision.timestamp}`,
      `parents: ${revision.parentIds.join(', ') || '(なし)'}`,
      `tags: ${revision.tags.join(', ') || '(なし)'}`,
      '',
      revision.message,
      '',
      ...(revision.changedPaths?.map((changedPath) => `* ${changedPath}`) ?? [])
    ].join('\n');

    const document = await this.generatedProvider.openDocument(
      `Bazaar コミット ${revisionDisplayLabel(revision)}`,
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
    this.panel?.dispose();
    this.panel = undefined;
  }

  private configureEditorPanel(panel: vscode.WebviewPanel): void {
    panel.webview.options = { enableScripts: true };
    panel.webview.html = renderHistoryEditorShellHtml();
    panel.webview.onDidReceiveMessage((message: HistoryEditorMessage) => {
      void this.handleEditorMessage(message);
    });
  }

  private async handleEditorMessage(message: HistoryEditorMessage): Promise<void> {
    if (message.command === 'refresh') {
      await this.refresh(this.pathFilter);
      return;
    }
    if (message.command === 'loadMore') {
      await this.loadMore();
      return;
    }

    const revision = this.revisionForEditorMessage(message.revisionId);
    if (!revision) {
      return;
    }
    if (message.command === 'showCommit') {
      await this.showCommit(revision);
    } else if (message.command === 'showDiff') {
      const changedPath = this.changedPathForEditorMessage(revision, message.path);
      await this.showCommitDiff(revision, changedPath);
    } else if (message.command === 'openFile') {
      const changedPath = this.changedPathForEditorMessage(revision, message.path);
      if (changedPath) {
        await this.openFileAtRevision(revision, changedPath);
      }
    }
  }

  private revisionForEditorMessage(value: unknown): BazaarRevision | undefined {
    const revisionSpec = normalizeRevisionSpec(value);
    if (!revisionSpec) {
      return undefined;
    }
    return this.visibleRevisions.find((revision) =>
      normalizeRevisionSpec(revision.revisionId) === revisionSpec ||
      normalizeRevisionSpec(revision.revno) === revisionSpec
    );
  }

  private changedPathForEditorMessage(revision: BazaarRevision, value: unknown): string | undefined {
    return typeof value === 'string' && revision.changedPaths?.includes(value) ? value : undefined;
  }

  private async postEditorData(): Promise<void> {
    if (!this.panel) {
      return;
    }
    const payload = this.createEditorPayload();
    await this.panel.webview.postMessage({ command: 'setHistory', payload });
  }

  private createEditorPayload(): HistoryEditorPayload {
    return createHistoryEditorPayload(this.visibleRevisions, {
      limit: this.currentLimit || this.historyPageSize(),
      pathFilter: this.pathFilter,
      loading: this.loading
    });
  }

  private historyPageSize(): number {
    return Math.max(1, vscode.workspace.getConfiguration('bazaar').get<number>('history.limit', 200));
  }

  private async openRevisionDiff(plan: Extract<HistoryCommitDiffPlan, { kind: 'fileDiff' }>): Promise<void> {
    const right = this.revisionProvider.createUriForPath(plan.changedPath, plan.rightRevision);
    const left = plan.leftEmpty
      ? this.revisionProvider.createEmptyUri(plan.changedPath, plan.leftRevision)
      : this.revisionProvider.createUriForPath(plan.changedPath, plan.leftRevision);
    await vscode.commands.executeCommand('vscode.diff', left, right, plan.title);
  }

  private async openCommitDiffDocument(plan: Extract<HistoryCommitDiffPlan, { kind: 'patchDocument' }>): Promise<void> {
    const diff = decodeBazaarPatchOutput(
      await this.client.diffChangeBytes(plan.revisionSpec, plan.changedPath),
      { preferredEncoding: repositoryFileEncoding() }
    );
    const document = await this.generatedProvider.openDocument(
      plan.title,
      diff.trimEnd() || '(差分なし)',
      'diff'
    );
    await vscode.window.showTextDocument(document, { preview: true });
  }
}

function renderHistoryEditorShellHtml(): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    html, body { height: 100%; }
    body { margin: 0; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
    button { font: inherit; cursor: pointer; }
    .toolbar { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 6px; padding: 8px; border-bottom: 1px solid var(--vscode-panel-border); background: var(--vscode-editor-background); }
    .toolbar .spacer { flex: 1; }
    .filter { overflow: hidden; color: var(--vscode-descriptionForeground); text-overflow: ellipsis; white-space: nowrap; }
    .action { border: 0; color: var(--vscode-button-foreground); background: var(--vscode-button-background); padding: 4px 8px; }
    .action.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    .layout { display: grid; grid-template-columns: minmax(360px, 1fr) minmax(320px, 38vw); height: calc(100vh - 42px); min-height: 0; }
    .list, .detail { overflow: auto; min-width: 0; }
    .detail { border-left: 1px solid var(--vscode-panel-border); padding: 12px; }
    .revision { display: grid; grid-template-columns: 84px minmax(0, 1fr) 116px; gap: 8px; width: 100%; border: 0; border-bottom: 1px solid var(--vscode-panel-border); color: var(--vscode-foreground); background: transparent; padding: 8px 10px; text-align: left; }
    .revision:hover, .revision.selected { background: var(--vscode-list-hoverBackground); }
    .revno { color: var(--vscode-charts-blue); font-weight: 600; }
    .summary, .meta, .date { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .meta, .date, .empty { color: var(--vscode-descriptionForeground); }
    h2 { margin: 0 0 8px; font-size: 14px; line-height: 20px; }
    .section { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--vscode-panel-border); }
    .files { display: flex; flex-direction: column; gap: 5px; }
    .file-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 4px; align-items: center; }
    .file-name { overflow: hidden; color: var(--vscode-descriptionForeground); text-overflow: ellipsis; white-space: nowrap; }
    .small { border: 0; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); padding: 3px 6px; }
    .load-more-sentinel { padding: 12px; border-bottom: 1px solid var(--vscode-panel-border); color: var(--vscode-descriptionForeground); text-align: center; }
  </style>
</head>
<body>
  <div class="toolbar">
    <button class="action" id="refresh">更新</button>
    <div class="spacer"></div>
    <div class="filter" id="filter"></div>
  </div>
  <div class="layout">
    <main class="list" id="list">Bazaar 履歴を読み込み中...</main>
    <aside class="detail" id="detail">リビジョンを選択してください</aside>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    let revisions = [];
    let byId = new Map();
    let selected;
    let canLoadMore = false;
    let loadingMore = false;
    let loadMoreObserver;
    const list = document.getElementById('list');

    document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ command: 'refresh' }));

    window.addEventListener('message', (event) => {
      if (event.data?.command !== 'setHistory') {
        return;
      }
      renderHistory(event.data.payload);
    });

    function renderHistory(payload) {
      revisions = payload.revisions || [];
      byId = new Map(revisions.map((revision) => [revision.graphId, revision]));
      canLoadMore = Boolean(payload.canLoadMore);
      loadingMore = Boolean(payload.loading);
      document.getElementById('filter').textContent = payload.pathFilter ? 'file: ' + payload.pathFilter : '';

      if (payload.loading && revisions.length === 0) {
        list.textContent = 'Bazaar 履歴を読み込み中...';
        return;
      }
      if (revisions.length === 0) {
        list.innerHTML = '<div class="empty" style="padding: 12px;">表示する履歴がありません。</div>';
        document.getElementById('detail').textContent = 'リビジョンを選択してください';
        return;
      }

      list.innerHTML = revisions.map((revision) =>
        '<button class="revision" data-revision-id="' + escapeHtml(revision.graphId) + '">' +
          '<span class="revno">' + escapeHtml(revision.revno) + '</span>' +
          '<span><span class="summary">' + escapeHtml(revision.summary) + '</span><br><span class="meta">' + escapeHtml([revision.committer, revision.branchNick, revision.tags.map((tag) => '#' + tag).join(' ')].filter(Boolean).join(' / ')) + '</span></span>' +
          '<span class="date">' + escapeHtml(revision.displayTimestamp || revision.timestamp) + '</span>' +
        '</button>'
      ).join('') + renderLoadMoreSentinel();
      observeLoadMoreSentinel(list);

      document.querySelectorAll('[data-revision-id]').forEach((button) => {
        button.addEventListener('click', () => {
          selected = button.dataset.revisionId;
          document.querySelectorAll('[data-revision-id]').forEach((item) => item.classList.toggle('selected', item === button));
          renderDetail(byId.get(selected));
        });
      });
      if (!selected || !byId.has(selected)) {
        selected = revisions[0]?.graphId;
      }
      const selectedButton = document.querySelector('[data-revision-id="' + cssEscape(selected || '') + '"]');
      if (selectedButton) {
        selectedButton.classList.add('selected');
      }
      renderDetail(byId.get(selected));
    }

    function renderDetail(revision) {
      const detail = document.getElementById('detail');
      if (!revision) {
        detail.textContent = 'リビジョンを選択してください';
        return;
      }
      const tags = revision.tags.length ? revision.tags.map((tag) => '#' + escapeHtml(tag)).join(' ') : '(なし)';
      const parents = revision.parentIds.length ? revision.parentIds.map(escapeHtml).join('<br>') : '(なし)';
      const files = revision.changedPaths.length
        ? revision.changedPaths.map((file) =>
            '<div class="file-row">' +
              '<span class="file-name" title="' + escapeHtml(file) + '">' + escapeHtml(file) + '</span>' +
              '<button class="small file-diff" data-path="' + escapeHtml(file) + '">差分</button>' +
              '<button class="small file-open" data-path="' + escapeHtml(file) + '">開く</button>' +
            '</div>'
          ).join('')
        : '<div class="empty">変更パスはログに含まれていません。</div>';
      detail.innerHTML =
        '<h2>' + escapeHtml(revision.revno + ' ' + revision.summary) + '</h2>' +
        '<div class="meta">' + escapeHtml(revision.displayTimestamp || revision.timestamp) + '<br>' + escapeHtml(revision.committer) + '<br>' + escapeHtml(revision.branchNick || '') + '</div>' +
        '<div class="section"><button class="action" id="show-commit">コミットを表示</button> <button class="action secondary" id="show-diff">コミット差分</button></div>' +
        '<div class="section"><div class="meta">revision-id<br>' + escapeHtml(revision.revisionId || '(なし)') + '</div><div class="meta">parents<br>' + parents + '</div><div class="meta">tags<br>' + tags + '</div></div>' +
        '<div class="section files">' + files + '</div>';
      document.getElementById('show-commit').addEventListener('click', () => vscode.postMessage({ command: 'showCommit', revisionId: revision.graphId }));
      document.getElementById('show-diff').addEventListener('click', () => vscode.postMessage({ command: 'showDiff', revisionId: revision.graphId }));
      document.querySelectorAll('.file-diff').forEach((button) => button.addEventListener('click', () => vscode.postMessage({ command: 'showDiff', revisionId: revision.graphId, path: button.dataset.path })));
      document.querySelectorAll('.file-open').forEach((button) => button.addEventListener('click', () => vscode.postMessage({ command: 'openFile', revisionId: revision.graphId, path: button.dataset.path })));
    }

    function renderLoadMoreSentinel() {
      if (!canLoadMore && !loadingMore) {
        return '';
      }
      return '<div id="load-more-sentinel" class="load-more-sentinel" aria-busy="' + String(loadingMore) + '">' +
        (loadingMore ? '続きを読み込み中...' : '続きを表示') +
        '</div>';
    }

    function observeLoadMoreSentinel(root) {
      if (loadMoreObserver) {
        loadMoreObserver.disconnect();
        loadMoreObserver = undefined;
      }
      const sentinel = document.getElementById('load-more-sentinel');
      if (!sentinel || !canLoadMore || loadingMore) {
        return;
      }
      if (!('IntersectionObserver' in window)) {
        sentinel.addEventListener('click', () => requestLoadMore());
        return;
      }
      loadMoreObserver = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          requestLoadMore();
        }
      }, { root });
      loadMoreObserver.observe(sentinel);
    }

    function requestLoadMore() {
      if (!canLoadMore || loadingMore) {
        return;
      }
      loadingMore = true;
      const sentinel = document.getElementById('load-more-sentinel');
      if (sentinel) {
        sentinel.textContent = '続きを読み込み中...';
        sentinel.setAttribute('aria-busy', 'true');
      }
      vscode.postMessage({ command: 'loadMore' });
    }

    function cssEscape(value) {
      if (window.CSS && CSS.escape) {
        return CSS.escape(value);
      }
      return String(value).replace(/"/g, '\\\\"');
    }

    function escapeHtml(value) {
      return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
  </script>
</body>
</html>`;
}

function firstLine(message: string): string {
  return message.split(/\r?\n/)[0] || '(メッセージなし)';
}

function showNoValidRevisionWarning(): void {
  vscode.window.showWarningMessage('有効な Bazaar リビジョンが選択されていません。');
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function repositoryFileEncoding(): string | undefined {
  return vscode.workspace.getConfiguration('files').get<string>('encoding');
}
