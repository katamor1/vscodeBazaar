import * as vscode from 'vscode';
import { buildGraph } from '../bazaar/graphModel';
import type { BazaarRevision, RevisionGraph } from '../bazaar/types';
import { createGraphPayload } from './graphPayload';
import { resolveGraphRevisionMessage, type GraphMessage } from './graphMessage';
import { BazaarRevisionCache } from './revisionCache';
import { createWebviewNonce, webviewContentSecurityPolicy } from './webviewSecurity';

type GraphHost = vscode.WebviewView | vscode.WebviewPanel;

export class BazaarGraphView implements vscode.WebviewViewProvider, vscode.Disposable {
  private view: vscode.WebviewView | undefined;
  private panel: vscode.WebviewPanel | undefined;
  private revisions: BazaarRevision[] = [];
  private graph: RevisionGraph = { nodes: [], edges: [] };
  private currentLimit = 0;
  private loading = false;

  constructor(
    private readonly revisionCache: BazaarRevisionCache,
    private readonly output?: vscode.OutputChannel
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    this.configureHost(webviewView);
    if (this.revisions.length === 0 && !this.loading) {
      void this.refresh();
    } else {
      void this.postGraphData();
    }
  }

  async refresh(limit?: number): Promise<void> {
    const config = vscode.workspace.getConfiguration('bazaar');
    const configuredLimit = config.get<number>('graph.limit', config.get<number>('history.limit', 200));
    const includeMerged = config.get<boolean>('history.includeMerged', true);
    this.currentLimit = Math.max(1, limit ?? (this.currentLimit || configuredLimit));
    this.loading = true;
    await this.postGraphData();
    try {
      this.revisions = await this.revisionCache.get({
        limit: this.currentLimit,
        includeMerged
      });
      this.graph = buildGraph(this.revisions);
    } finally {
      this.loading = false;
      await this.postGraphData();
    }
  }

  async loadMore(): Promise<void> {
    const step = vscode.workspace.getConfiguration('bazaar').get<number>('graph.limit', 200);
    this.revisionCache.invalidate();
    await this.refresh(this.currentLimit + Math.max(1, step));
  }

  open(): void {
    void vscode.commands.executeCommand('workbench.view.scm')
      .then(() => vscode.commands.executeCommand('bazaarGraph.focus'))
      .then(undefined, () => undefined);
  }

  openEditor(): void {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'bazaarGraphEditor',
        'Bazaar グラフ',
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });
      this.configureHost(this.panel);
    }
    this.panel.reveal(vscode.ViewColumn.Active);
    if (this.revisions.length === 0 && !this.loading) {
      void this.refresh();
    } else {
      void this.postGraphData();
    }
  }

  dispose(): void {
    this.view = undefined;
    this.panel?.dispose();
    this.panel = undefined;
  }

  private configureHost(host: GraphHost): void {
    const nonce = createWebviewNonce();
    host.webview.options = { enableScripts: true };
    host.webview.html = renderGraphShellHtml(host.webview.cspSource, nonce);
    host.webview.onDidReceiveMessage((message: GraphMessage | { command: 'loadMore' }) => {
      void this.handleMessage(message);
    });
  }

  private async handleMessage(message: GraphMessage | { command: 'loadMore' }): Promise<void> {
    if (message.command === 'loadMore') {
      await this.loadMore();
      return;
    }
    const command = resolveGraphRevisionMessage(this.revisions, message);
    if (!command) {
      return;
    }
    if (command.command === 'refresh') {
      this.revisionCache.invalidate();
      await this.refresh();
    } else if (command.command === 'showCommit') {
      await vscode.commands.executeCommand('bazaar.history.showCommit', command.revision);
    } else if (command.command === 'showDiff') {
      await vscode.commands.executeCommand('bazaar.history.showCommitDiff', command.revision, command.path);
    }
  }

  private async postGraphData(): Promise<void> {
    const payload = createGraphPayload(this.graph, this.revisions, {
      limit: this.currentLimit,
      loading: this.loading
    });
    await Promise.all([
      this.view?.webview.postMessage({ command: 'setGraph', payload }),
      this.panel?.webview.postMessage({ command: 'setGraph', payload })
    ].filter(Boolean) as Thenable<boolean>[]);
  }
}

function renderGraphShellHtml(cspSource: string, nonce: string): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${webviewContentSecurityPolicy(cspSource, nonce)}">
  <style nonce="${nonce}">
    html, body { height: 100%; }
    body { padding: 0; margin: 0; color: var(--vscode-foreground); font-family: var(--vscode-font-family); }
    .toolbar { display: flex; gap: 6px; padding: 8px; border-bottom: 1px solid var(--vscode-panel-border); }
    button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; padding: 4px 8px; }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    .layout { display: grid; grid-template-columns: minmax(420px, 1fr) 300px; height: calc(100vh - 43px); min-height: 0; }
    .graph-wrap { overflow: auto; }
    .detail { border-left: 1px solid var(--vscode-panel-border); padding: 10px; overflow: auto; }
    .detail h2 { margin: 0 0 6px; font-size: 13px; font-weight: 600; }
    .meta { color: var(--vscode-descriptionForeground); font-size: 12px; margin-bottom: 10px; }
    .files { display: flex; flex-direction: column; gap: 4px; }
    .file { text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    svg { display: block; min-width: 100%; }
    text { font-size: 12px; dominant-baseline: middle; }
    .graph-edge { stroke: var(--vscode-descriptionForeground); stroke-width: 1.4; fill: none; }
    .graph-node { cursor: pointer; }
    .graph-node circle { fill: var(--vscode-charts-blue); }
    .graph-node.selected circle { fill: var(--vscode-charts-orange); }
    .graph-label { fill: var(--vscode-foreground); }
    .graph-label-meta { fill: var(--vscode-descriptionForeground); }
    .load-more-sentinel { padding: 10px; color: var(--vscode-descriptionForeground); text-align: center; }
  </style>
</head>
<body>
  <div class="toolbar">
    <button id="refresh">更新</button>
    <button id="diff">選択リビジョンの差分</button>
  </div>
  <div class="layout">
    <div class="graph-wrap" id="graph">履歴グラフを読み込み中...</div>
    <aside class="detail" id="detail">リビジョンを選択してください</aside>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let revisions = [];
    let byId = new Map();
    let selected;
    let canLoadMore = false;
    let loadingMore = false;
    let loadMoreObserver;
    const graphElement = document.getElementById('graph');

    document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ command: 'refresh' }));
    document.getElementById('diff').addEventListener('click', () => selected && vscode.postMessage({ command: 'showDiff', revisionId: selected }));

    window.addEventListener('message', (event) => {
      if (event.data?.command !== 'setGraph') {
        return;
      }
      renderGraph(event.data.payload);
    });

    function renderGraph(payload) {
      revisions = payload.revisions || [];
      canLoadMore = Boolean(payload.canLoadMore);
      loadingMore = Boolean(payload.loading);
      byId = new Map(revisions.map((revision) => [revision.graphId, revision]));
      const graph = payload.graph || { nodes: [], edges: [] };

      if (!graph.nodes.length) {
        graphElement.textContent = payload.loading ? '履歴グラフを読み込み中...' : '履歴グラフを表示するリビジョンがありません。';
        document.getElementById('detail').textContent = 'リビジョンを選択してください';
        return;
      }

      graphElement.innerHTML = String(payload.graphHtml || '') + renderLoadMoreSentinel();
      observeLoadMoreSentinel(graphElement);
      document.querySelectorAll('.graph-node').forEach((node) => {
        node.addEventListener('click', () => {
          selected = node.dataset.revisionId;
          document.querySelectorAll('.graph-node').forEach((item) => item.classList.toggle('selected', item === node));
          renderDetail(byId.get(selected));
          vscode.postMessage({ command: 'showCommit', revisionId: selected });
        });
      });
      if (selected && byId.has(selected)) {
        renderDetail(byId.get(selected));
      }
    }

    function renderDetail(revision) {
      if (!revision) {
        return;
      }
      const tags = revision.tags.map((tag) => '<span>#' + escapeHtml(tag) + '</span>').join(' ');
      const parents = revision.parents.length ? revision.parents.map(escapeHtml).join('<br>') : '(なし)';
      const files = revision.changedPaths.length
        ? revision.changedPaths.map((file) => '<button class="file" data-file="' + escapeHtml(file) + '">' + escapeHtml(file) + '</button>').join('')
        : '<div class="meta">読み込んだログデータに変更パスはありません。</div>';
      document.getElementById('detail').innerHTML =
        '<h2>' + escapeHtml(revision.revno + ' ' + firstLine(revision.message)) + '</h2>' +
        '<div class="meta">' + escapeHtml(revision.committer) + '<br>' + escapeHtml(revision.displayTimestamp || revision.timestamp) + '<br>' + escapeHtml(revision.branchNick || '') + ' ' + tags + '</div>' +
        '<div class="meta">親<br>' + parents + '</div>' +
        '<div class="files">' + files + '</div>';
      document.querySelectorAll('.file').forEach((fileButton) => {
        fileButton.addEventListener('click', () => {
          vscode.postMessage({ command: 'showDiff', revisionId: selected, path: fileButton.dataset.file });
        });
      });
    }

    function firstLine(value) {
      return (value || '').split(/\\r?\\n/)[0] || '(メッセージなし)';
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

    function escapeHtml(value) {
      return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
  </script>
</body>
</html>`;
}
