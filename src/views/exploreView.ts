import * as vscode from 'vscode';
import { buildGraph } from '../bazaar/graphModel';
import { normalizeRevisionSpec, revisionGraphId } from '../bazaar/revisionSpec';
import type { BazaarClient } from '../bazaar/client';
import type { BazaarRevision } from '../bazaar/types';
import { expandUnknownDirectories } from '../bazaar/unknownExpansion';
import {
  createBazaarExploreModel,
  createEmptyBazaarExploreSnapshot,
  extendBazaarExploreHistory,
  type BazaarExploreLoadError,
  type BazaarExploreModel,
  type BazaarExploreSnapshot
} from './exploreSnapshot';
import { canLoadMoreRevisions } from './loadMoreSentinel';
import { BazaarRevisionCache } from './revisionCache';
import { createWebviewNonce, webviewContentSecurityPolicy } from './webviewSecurity';

type ExploreHost = vscode.WebviewView | vscode.WebviewPanel;

type ExploreMessage =
  | { command: 'refresh' }
  | { command: 'loadMore' }
  | { command: 'openOutput' }
  | { command: 'showCommit'; revisionId?: unknown }
  | { command: 'showDiff'; revisionId?: unknown; path?: unknown };

interface ExploreLoadResult<T> {
  value: T;
  error?: BazaarExploreLoadError;
}

const maxExploreRevisions = 40;

export class BazaarExploreView implements vscode.WebviewViewProvider, vscode.Disposable {
  private view: vscode.WebviewView | undefined;
  private panel: vscode.WebviewPanel | undefined;
  private snapshot: BazaarExploreSnapshot;
  private currentHistoryLimit = 0;
  private historyLoading = false;

  constructor(
    private readonly rootPath: string,
    private readonly statusClient: BazaarClient,
    private readonly metadataClient: BazaarClient,
    private readonly revisionCache: BazaarRevisionCache,
    private readonly output?: vscode.OutputChannel
  ) {
    this.snapshot = createEmptyBazaarExploreSnapshot(rootPath);
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    this.configureHost(webviewView);
    this.render();
    if (!this.snapshot.loadedAt) {
      void this.refresh();
    }
  }

  async refresh(): Promise<void> {
    const config = vscode.workspace.getConfiguration('bazaar');
    const historyLimit = Math.min(config.get<number>('history.limit', 200), maxExploreRevisions);
    const includeMerged = config.get<boolean>('history.includeMerged', true);
    const expandUnknowns = config.get<boolean>('unknown.expandDirectories', true);
    const maxExpandedFiles = config.get<number>('unknown.maxExpandedFiles', 1000);
    this.currentHistoryLimit = Math.max(1, historyLimit);

    const [
      changes,
      conflicts,
      branches,
      tags,
      shelves,
      revisions,
      info
    ] = await Promise.all([
      this.loadPart('status', [], async () => {
        const rawChanges = await this.statusClient.status();
        return expandUnknowns ? expandUnknownDirectories(this.rootPath, rawChanges, { maxExpandedFiles }) : rawChanges;
      }),
      this.loadPart('conflicts', [], () => this.statusClient.conflicts()),
      this.loadPart('branches', [], () => this.metadataClient.branches()),
      this.loadPart('tags', [], () => this.metadataClient.tags()),
      this.loadPart('shelves', [], () => this.metadataClient.shelves()),
      this.loadPart('history', [], () => this.revisionCache.get(
        {
          limit: historyLimit,
          includeMerged
        }
      )),
      this.loadPart('info', {}, () => this.metadataClient.info())
    ]);

    const errors = [changes, conflicts, branches, tags, shelves, revisions, info]
      .flatMap((result) => result.error ? [result.error] : []);
    this.snapshot = {
      rootPath: this.rootPath,
      loadedAt: new Date().toISOString(),
      changes: changes.value,
      conflicts: conflicts.value,
      branches: branches.value,
      tags: tags.value,
      shelves: shelves.value,
      revisions: revisions.value,
      graph: buildGraph(revisions.value),
      info: info.value,
      errors
    };
    this.render();
  }

  async loadMore(): Promise<void> {
    const config = vscode.workspace.getConfiguration('bazaar');
    const pageSize = Math.max(1, config.get<number>('history.limit', 200));
    const includeMerged = config.get<boolean>('history.includeMerged', true);
    this.currentHistoryLimit = Math.max(this.currentHistoryLimit || maxExploreRevisions, maxExploreRevisions) + pageSize;
    this.historyLoading = true;
    this.render();
    try {
      const revisions = await this.loadPart('history', this.snapshot.revisions, () => this.revisionCache.get({
        limit: this.currentHistoryLimit,
        includeMerged
      }));
      const nextSnapshot = extendBazaarExploreHistory(this.snapshot, revisions.value);
      this.snapshot = revisions.error
        ? { ...nextSnapshot, errors: [...nextSnapshot.errors, revisions.error] }
        : nextSnapshot;
    } finally {
      this.historyLoading = false;
      this.render();
    }
  }

  open(): void {
    void vscode.commands.executeCommand('workbench.view.scm')
      .then(() => vscode.commands.executeCommand('bazaarExplore.focus'))
      .then(undefined, () => undefined);
  }

  openEditor(): void {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'bazaarExploreEditor',
        'BAZAAR EXPLORE',
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });
      this.configureHost(this.panel);
    }
    this.panel.reveal(vscode.ViewColumn.Active);
    this.render();
    if (!this.snapshot.loadedAt) {
      void this.refresh();
    }
  }

  dispose(): void {
    this.view = undefined;
    this.panel?.dispose();
    this.panel = undefined;
  }

  isVisible(): boolean {
    return this.view?.visible ?? false;
  }

  private async handleMessage(message: ExploreMessage): Promise<void> {
    try {
      if (message.command === 'refresh') {
        await this.refresh();
        return;
      }
      if (message.command === 'loadMore') {
        await this.loadMore();
        return;
      }
      if (message.command === 'openOutput') {
        await vscode.commands.executeCommand('bazaar.openOutput');
        return;
      }

      const revision = this.revisionForMessage(message.revisionId);
      if (!revision) {
        return;
      }
      if (message.command === 'showCommit') {
        await vscode.commands.executeCommand('bazaar.history.showCommit', revision);
      } else if (message.command === 'showDiff') {
        await vscode.commands.executeCommand('bazaar.history.showCommitDiff', revision, this.changedPathForMessage(revision, message.path));
      }
    } catch (error) {
      this.output?.appendLine(`BAZAAR EXPLORE の操作に失敗しました: ${formatError(error)}`);
    }
  }

  private revisionForMessage(value: unknown): BazaarRevision | undefined {
    const graphId = normalizeRevisionSpec(value);
    if (!graphId) {
      return undefined;
    }
    return this.snapshot.revisions.find((revision) => revisionGraphId(revision) === graphId);
  }

  private changedPathForMessage(revision: BazaarRevision, value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    return revision.changedPaths?.includes(value) ? value : undefined;
  }

  private async loadPart<T>(source: string, fallback: T, task: () => Promise<T>): Promise<ExploreLoadResult<T>> {
    try {
      return { value: await task() };
    } catch (error) {
      const loadError = { source, message: formatError(error) };
      this.output?.appendLine(`BAZAAR EXPLORE が ${source} を読み込めませんでした: ${loadError.message}`);
      return { value: fallback, error: loadError };
    }
  }

  private render(): void {
    const model = createBazaarExploreModel(this.snapshot);
    const loadMore = {
      canLoadMore: canLoadMoreRevisions(model.revisions),
      loading: this.historyLoading
    };
    if (this.view) {
      this.view.webview.html = renderExploreHtml(
        model,
        loadMore,
        this.view.webview.cspSource,
        createWebviewNonce()
      );
    }
    if (this.panel) {
      this.panel.webview.html = renderExploreHtml(
        model,
        loadMore,
        this.panel.webview.cspSource,
        createWebviewNonce()
      );
    }
  }

  private configureHost(host: ExploreHost): void {
    host.webview.options = { enableScripts: true };
    host.webview.onDidReceiveMessage((message: ExploreMessage) => {
      void this.handleMessage(message);
    });
  }
}

function renderExploreHtml(
  model: BazaarExploreModel,
  loadMore: { canLoadMore: boolean; loading: boolean },
  cspSource: string,
  nonce: string
): string {
  const modelJson = JSON.stringify(model).replace(/</g, '\\u003c');
  const loadMoreJson = JSON.stringify(loadMore);
  return `<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${webviewContentSecurityPolicy(cspSource, nonce)}">
  <style nonce="${nonce}">
    :root {
      color-scheme: var(--vscode-color-scheme);
    }
    body {
      margin: 0;
      padding: 0;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    button {
      font: inherit;
      cursor: pointer;
    }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 12px 8px;
      background: var(--vscode-sideBar-background);
      border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-panel-border));
    }
    h1 {
      margin: 0;
      font-size: 13px;
      line-height: 18px;
      letter-spacing: 0;
      font-weight: 700;
    }
    h2 {
      margin: 0 0 8px;
      font-size: 12px;
      line-height: 16px;
      letter-spacing: 0;
      color: var(--vscode-sideBarTitle-foreground, var(--vscode-foreground));
      text-transform: uppercase;
    }
    .root {
      overflow: hidden;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      line-height: 15px;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
    }
    .actions {
      display: flex;
      gap: 6px;
      flex: 0 0 auto;
    }
    .action {
      min-width: 32px;
      min-height: 26px;
      border: 1px solid var(--vscode-button-border, transparent);
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border-radius: 3px;
      padding: 3px 8px;
    }
    .action.secondary {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
    }
    .content {
      padding: 10px 12px 14px;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
      margin-bottom: 10px;
    }
    .metric {
      min-width: 0;
      border: 1px solid var(--vscode-panel-border);
      border-left: 3px solid var(--vscode-charts-blue);
      padding: 7px 8px;
      background: var(--vscode-editorWidget-background);
    }
    .metric.clean {
      border-left-color: var(--vscode-charts-green);
    }
    .metric.dirty {
      border-left-color: var(--vscode-charts-yellow);
    }
    .metric.conflict {
      border-left-color: var(--vscode-charts-red);
    }
    .metric.partial {
      border-left-color: var(--vscode-charts-orange);
    }
    .metric-value {
      overflow: hidden;
      font-size: 16px;
      line-height: 20px;
      font-weight: 700;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .metric-label {
      overflow: hidden;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      line-height: 15px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .section {
      padding: 10px 0;
      border-top: 1px solid var(--vscode-panel-border);
    }
    .status-group {
      margin-bottom: 8px;
    }
    .status-heading {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 4px;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      line-height: 15px;
    }
    .row {
      min-width: 0;
      padding: 4px 0;
      border-top: 1px solid color-mix(in srgb, var(--vscode-panel-border) 70%, transparent);
    }
    .primary {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .secondary {
      overflow: hidden;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      line-height: 15px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .graph-wrap {
      overflow-x: auto;
      border: 1px solid var(--vscode-panel-border);
      background: var(--vscode-editor-background);
    }
    svg {
      display: block;
      min-width: 100%;
    }
    text {
      font-size: 11px;
      dominant-baseline: middle;
    }
    .graph-edge {
      stroke: var(--vscode-descriptionForeground);
      stroke-width: 1.4;
      fill: none;
    }
    .graph-node {
      cursor: pointer;
    }
    .graph-node circle {
      fill: var(--vscode-charts-blue);
    }
    .graph-node.selected circle {
      fill: var(--vscode-charts-orange);
    }
    .graph-label {
      fill: var(--vscode-foreground);
    }
    .graph-label-meta {
      fill: var(--vscode-descriptionForeground);
    }
    .revision-actions,
    .file-actions {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-top: 8px;
    }
    .file-button,
    .revision-button {
      width: 100%;
      min-height: 24px;
      overflow: hidden;
      border: 0;
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
      border-radius: 3px;
      padding: 3px 6px;
      text-align: left;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .empty {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      line-height: 18px;
    }
    .errors {
      border-left: 3px solid var(--vscode-charts-orange);
      padding-left: 8px;
    }
    .spacer {
      height: 8px;
    }
    .load-more-sentinel {
      margin-top: 8px;
      padding: 10px;
      color: var(--vscode-descriptionForeground);
      text-align: center;
      border-top: 1px solid var(--vscode-panel-border);
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div>
      <h1>BAZAAR EXPLORE</h1>
      <div class="root" title="${escapeHtml(model.rootPath)}">${escapeHtml(model.rootPath)}</div>
    </div>
    <div class="actions">
      <button class="action" id="refresh" title="更新" aria-label="更新">更新</button>
      <button class="action secondary" id="output" title="出力" aria-label="出力">出力</button>
    </div>
  </header>
  <main class="content">
    ${renderSummary(model)}
    ${renderErrors(model)}
    <section class="section">
      <h2>Status</h2>
      ${renderStatus(model)}
    </section>
    <section class="section">
      <h2>Graph</h2>
      ${renderGraphHtml(model)}
      <div id="revision-detail" class="revision-detail"></div>
      ${renderLoadMoreSentinel(loadMore)}
    </section>
    <section class="section">
      <h2>Branches</h2>
      ${renderBranches(model)}
    </section>
    <section class="section">
      <h2>Shelves / Tags</h2>
      ${renderShelvesAndTags(model)}
    </section>
    <section class="section">
      <h2>Info</h2>
      ${renderInfo(model)}
    </section>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const model = ${modelJson};
    let loadState = ${loadMoreJson};
    const revisions = new Map(model.revisions.map((revision) => [revision.graphId, revision]));
    let selectedRevisionId = model.revisions[0]?.graphId;
    let loadMoreObserver;

    document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ command: 'refresh' }));
    document.getElementById('output').addEventListener('click', () => vscode.postMessage({ command: 'openOutput' }));
    observeLoadMoreSentinel();

    document.querySelectorAll('.graph-node').forEach((element) => {
      element.addEventListener('click', () => {
        selectedRevisionId = element.dataset.revisionId;
        document.querySelectorAll('.graph-node').forEach((item) => {
          item.classList.toggle('selected', item.dataset.revisionId === selectedRevisionId);
        });
        renderRevisionDetail(revisions.get(selectedRevisionId));
      });
    });

    renderRevisionDetail(revisions.get(selectedRevisionId));
    const initial = document.querySelector('[data-revision-id="' + cssEscape(selectedRevisionId || '') + '"]');
    if (initial) {
      initial.classList.add('selected');
    }

    function renderRevisionDetail(revision) {
      const container = document.getElementById('revision-detail');
      if (!revision) {
        container.innerHTML = '<div class="empty">履歴が読み込まれていません。</div>';
        return;
      }
      const tags = revision.tags.length ? revision.tags.map((tag) => '#' + escapeHtml(tag)).join(' ') : '';
      const parents = revision.parentIds.length ? revision.parentIds.map(escapeHtml).join('<br>') : '(なし)';
      const files = revision.changedPaths.length
        ? revision.changedPaths.map((file) => '<button class="file-button" data-path="' + escapeHtml(file) + '">' + escapeHtml(file) + '</button>').join('')
        : '<div class="empty">変更パスはログに含まれていません。</div>';
      container.innerHTML =
        '<div class="row">' +
          '<div class="primary">' + escapeHtml(revision.revno + ' ' + revision.summary) + '</div>' +
          '<div class="secondary">' + escapeHtml(revision.committer) + ' / ' + escapeHtml(revision.displayTimestamp || revision.timestamp) + '</div>' +
          '<div class="secondary">' + escapeHtml(revision.branchNick || '') + ' ' + tags + '</div>' +
          '<div class="secondary">parents<br>' + parents + '</div>' +
        '</div>' +
        '<div class="revision-actions">' +
          '<button class="revision-button" id="show-commit">コミットを表示</button>' +
          '<button class="revision-button" id="show-diff">コミット差分</button>' +
        '</div>' +
        '<div class="file-actions">' + files + '</div>';

      document.getElementById('show-commit').addEventListener('click', () => vscode.postMessage({ command: 'showCommit', revisionId: revision.graphId }));
      document.getElementById('show-diff').addEventListener('click', () => vscode.postMessage({ command: 'showDiff', revisionId: revision.graphId }));
      document.querySelectorAll('[data-path]').forEach((button) => {
        button.addEventListener('click', () => vscode.postMessage({
          command: 'showDiff',
          revisionId: revision.graphId,
          path: button.dataset.path
        }));
      });
    }

    function cssEscape(value) {
      if (window.CSS && CSS.escape) {
        return CSS.escape(value);
      }
      return String(value).replace(/"/g, '\\\\"');
    }

    function observeLoadMoreSentinel() {
      if (loadMoreObserver) {
        loadMoreObserver.disconnect();
        loadMoreObserver = undefined;
      }
      const sentinel = document.getElementById('load-more-sentinel');
      if (!sentinel || !loadState.canLoadMore || loadState.loading) {
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
      });
      loadMoreObserver.observe(sentinel);
    }

    function requestLoadMore() {
      if (!loadState.canLoadMore || loadState.loading) {
        return;
      }
      loadState.loading = true;
      const sentinel = document.getElementById('load-more-sentinel');
      if (sentinel) {
        sentinel.textContent = '続きを読み込み中...';
        sentinel.setAttribute('aria-busy', 'true');
      }
      vscode.postMessage({ command: 'loadMore' });
    }

    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
  </script>
</body>
</html>`;
}

function renderSummary(model: BazaarExploreModel): string {
  return `<section class="summary">
    <div class="metric ${model.health}">
      <div class="metric-value">${escapeHtml(model.headline)}</div>
      <div class="metric-label">tree status</div>
    </div>
    <div class="metric">
      <div class="metric-value">${model.counts.changes}</div>
      <div class="metric-label">changes</div>
    </div>
    <div class="metric ${model.counts.conflicts > 0 ? 'conflict' : ''}">
      <div class="metric-value">${model.counts.conflicts}</div>
      <div class="metric-label">conflicts</div>
    </div>
    <div class="metric">
      <div class="metric-value">${model.counts.revisions}</div>
      <div class="metric-label">recent revisions</div>
    </div>
  </section>`;
}

function renderErrors(model: BazaarExploreModel): string {
  if (model.errors.length === 0) {
    return '';
  }
  return `<section class="section errors">
    <h2>Load Errors</h2>
    ${model.errors.map((error) => `<div class="row"><div class="primary">${escapeHtml(error.source)}</div><div class="secondary">${escapeHtml(error.message)}</div></div>`).join('')}
  </section>`;
}

function renderStatus(model: BazaarExploreModel): string {
  if (model.statusGroups.length === 0) {
    return '<div class="empty">作業ツリーに表示対象の変更はありません。</div>';
  }
  return model.statusGroups.map((group) => `<div class="status-group">
    <div class="status-heading"><span>${escapeHtml(group.label)}</span><span>${group.items.length}</span></div>
    ${group.items.map((item) => `<div class="row"><div class="primary" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</div><div class="secondary">${escapeHtml(item.oldPath ? `${item.oldPath} -> ${item.description}` : item.description)}</div></div>`).join('')}
  </div>`).join('');
}

function renderGraphHtml(model: BazaarExploreModel): string {
  if (!model.graphHtml) {
    return '<div class="empty">履歴グラフを表示するリビジョンがありません。</div>';
  }
  return `<div class="graph-wrap">${model.graphHtml}</div>`;
}

function renderLoadMoreSentinel(loadMore: { canLoadMore: boolean; loading: boolean }): string {
  if (!loadMore.canLoadMore && !loadMore.loading) {
    return '';
  }
  return `<div id="load-more-sentinel" class="load-more-sentinel" aria-busy="${loadMore.loading ? 'true' : 'false'}">${loadMore.loading ? '続きを読み込み中...' : '続きを表示'}</div>`;
}

function renderBranches(model: BazaarExploreModel): string {
  if (model.branches.length === 0) {
    return '<div class="empty">ブランチ情報は読み込まれていません。</div>';
  }
  return model.branches.slice(0, 12).map((branch) => `<div class="row">
    <div class="primary">${branch.current ? '* ' : ''}${escapeHtml(branch.name)}</div>
    <div class="secondary" title="${escapeHtml(branch.path)}">${escapeHtml(branch.path)}</div>
  </div>`).join('');
}

function renderShelvesAndTags(model: BazaarExploreModel): string {
  const shelves = model.shelves.length
    ? model.shelves.slice(0, 8).map((shelf) => `<div class="row"><div class="primary">shelf ${escapeHtml(shelf.id)}</div><div class="secondary">${escapeHtml(shelf.message)}</div></div>`).join('')
    : '<div class="empty">シェルブはありません。</div>';
  const tags = model.tags.length
    ? model.tags.slice(0, 12).map((tag) => `<div class="row"><div class="primary">${escapeHtml(tag.name)}</div><div class="secondary">${escapeHtml(tag.revision)}</div></div>`).join('')
    : '<div class="empty">タグは読み込まれていません。</div>';
  return `${shelves}<div class="spacer"></div>${tags}`;
}

function renderInfo(model: BazaarExploreModel): string {
  if (model.infoItems.length === 0) {
    return `<div class="empty">Bazaar info の表示項目はありません。${model.loadedAt ? ` 最終更新: ${escapeHtml(model.loadedAt)}` : ''}</div>`;
  }
  return `${model.infoItems.map((item) => `<div class="row"><div class="primary">${escapeHtml(item.label)}</div><div class="secondary" title="${escapeHtml(item.value)}">${escapeHtml(item.value)}</div></div>`).join('')}
    <div class="row"><div class="primary">Loaded at</div><div class="secondary">${escapeHtml(model.loadedAt)}</div></div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
