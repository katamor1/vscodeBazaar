import * as vscode from 'vscode';
import { buildGraph } from '../bazaar/graphModel';
import { revisionGraphId } from '../bazaar/revisionSpec';
import type { BazaarRevision, RevisionGraph } from '../bazaar/types';
import { resolveGraphRevisionMessage, type GraphMessage } from './graphMessage';
import { BazaarRevisionCache } from './revisionCache';

type GraphHost = vscode.WebviewView | vscode.WebviewPanel;

interface GraphPayloadRevision {
  graphId: string;
  revno: string;
  committer: string;
  timestamp: string;
  branchNick: string;
  tags: string[];
  parents: string[];
  message: string;
  changedPaths: string[];
}

interface GraphPayload {
  graph: RevisionGraph;
  revisions: GraphPayloadRevision[];
  limit: number;
  canLoadMore: boolean;
}

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
    try {
      this.revisions = await this.revisionCache.get({
        limit: this.currentLimit,
        includeMerged
      });
      this.graph = buildGraph(this.revisions);
      await this.postGraphData();
    } finally {
      this.loading = false;
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
    host.webview.options = { enableScripts: true };
    host.webview.html = renderGraphShellHtml();
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
    const payload = createGraphPayload(this.graph, this.revisions, this.currentLimit);
    await Promise.all([
      this.view?.webview.postMessage({ command: 'setGraph', payload }),
      this.panel?.webview.postMessage({ command: 'setGraph', payload })
    ].filter(Boolean) as Thenable<boolean>[]);
  }
}

function createGraphPayload(graph: RevisionGraph, revisions: BazaarRevision[], limit: number): GraphPayload {
  return {
    graph,
    revisions: revisions.flatMap((revision) => {
      const graphId = revisionGraphId(revision);
      return graphId
        ? [{
            graphId,
            revno: revision.revno,
            committer: revision.committer,
            timestamp: revision.timestamp,
            branchNick: revision.branchNick,
            tags: revision.tags,
            parents: revision.parentIds,
            message: revision.message,
            changedPaths: revision.changedPaths ?? []
          }]
        : [];
    }),
    limit,
    canLoadMore: revisions.length >= limit
  };
}

function renderGraphShellHtml(): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { padding: 0; margin: 0; color: var(--vscode-foreground); font-family: var(--vscode-font-family); }
    .toolbar { display: flex; gap: 6px; padding: 8px; border-bottom: 1px solid var(--vscode-panel-border); }
    button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; padding: 4px 8px; }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    .layout { display: grid; grid-template-columns: minmax(420px, 1fr) 300px; min-height: 0; }
    .graph-wrap { overflow: auto; }
    .detail { border-left: 1px solid var(--vscode-panel-border); padding: 10px; overflow: auto; }
    .detail h2 { margin: 0 0 6px; font-size: 13px; font-weight: 600; }
    .meta { color: var(--vscode-descriptionForeground); font-size: 12px; margin-bottom: 10px; }
    .files { display: flex; flex-direction: column; gap: 4px; }
    .file { text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    svg { display: block; min-width: 100%; }
    text { font-size: 12px; dominant-baseline: middle; }
    .edge { stroke: var(--vscode-descriptionForeground); stroke-width: 1.4; fill: none; }
    .node { cursor: pointer; }
    .node circle { fill: var(--vscode-charts-blue); }
    .node.selected circle { fill: var(--vscode-charts-orange); }
    .label { fill: var(--vscode-foreground); }
    .label-meta { fill: var(--vscode-descriptionForeground); }
  </style>
</head>
<body>
  <div class="toolbar">
    <button id="refresh">更新</button>
    <button id="load-more" class="secondary">さらに読み込む</button>
    <button id="diff">選択リビジョンの差分</button>
  </div>
  <div class="layout">
    <div class="graph-wrap" id="graph">履歴グラフを読み込み中...</div>
    <aside class="detail" id="detail">リビジョンを選択してください</aside>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    let revisions = [];
    let byId = new Map();
    let selected;

    document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ command: 'refresh' }));
    document.getElementById('load-more').addEventListener('click', () => vscode.postMessage({ command: 'loadMore' }));
    document.getElementById('diff').addEventListener('click', () => selected && vscode.postMessage({ command: 'showDiff', revisionId: selected }));

    window.addEventListener('message', (event) => {
      if (event.data?.command !== 'setGraph') {
        return;
      }
      renderGraph(event.data.payload);
    });

    function renderGraph(payload) {
      revisions = payload.revisions || [];
      byId = new Map(revisions.map((revision) => [revision.graphId, revision]));
      const graph = payload.graph || { nodes: [], edges: [] };
      document.getElementById('load-more').style.display = payload.canLoadMore ? '' : 'none';

      if (!graph.nodes.length) {
        document.getElementById('graph').textContent = '履歴グラフを表示するリビジョンがありません。';
        document.getElementById('detail').textContent = 'リビジョンを選択してください';
        return;
      }

      const rowHeight = 42;
      const columnWidth = 42;
      const graphLaneWidth = 190;
      const labelLaneX = graphLaneWidth + 24;
      const radius = 7;
      const width = Math.max(720, labelLaneX + 520);
      const height = Math.max(160, graph.nodes.length * rowHeight + 40);
      const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
      const edgeSvg = graph.edges.map((edge) => {
        const from = nodeById.get(edge.from);
        const to = nodeById.get(edge.to);
        if (!from || !to) {
          return '';
        }
        const x1 = 24 + from.x * columnWidth;
        const y1 = 24 + from.y * rowHeight;
        const x2 = 24 + to.x * columnWidth;
        const y2 = 24 + to.y * rowHeight;
        const midY = y1 + Math.max(10, Math.abs(y2 - y1) / 2);
        return '<path class="edge" d="M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + midY + ', ' + x2 + ' ' + midY + ', ' + x2 + ' ' + y2 + '" />';
      }).join('');
      const nodeSvg = graph.nodes.map((node) => {
        const x = 24 + node.x * columnWidth;
        const y = 24 + node.y * rowHeight;
        const revision = byId.get(node.id);
        const meta = revision ? [revision.committer, revision.branchNick, revision.tags.map((tag) => '#' + tag).join(' ')].filter(Boolean).join(' / ') : '';
        return '<g class="node" data-id="' + escapeHtml(node.id) + '">' +
          '<circle cx="' + x + '" cy="' + y + '" r="' + radius + '" />' +
          '<text class="label" x="' + labelLaneX + '" y="' + (y - 5) + '">' + escapeHtml(node.label) + '</text>' +
          '<text class="label-meta" x="' + labelLaneX + '" y="' + (y + 11) + '">' + escapeHtml(meta) + '</text>' +
        '</g>';
      }).join('');
      document.getElementById('graph').innerHTML = '<svg viewBox="0 0 ' + width + ' ' + height + '" width="' + width + '" height="' + height + '" role="img" aria-label="Bazaar リビジョングラフ">' + edgeSvg + nodeSvg + '</svg>';
      document.querySelectorAll('.node').forEach((node) => {
        node.addEventListener('click', () => {
          selected = node.dataset.id;
          document.querySelectorAll('.node').forEach((item) => item.classList.toggle('selected', item === node));
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
        '<div class="meta">' + escapeHtml(revision.committer) + '<br>' + escapeHtml(revision.timestamp) + '<br>' + escapeHtml(revision.branchNick || '') + ' ' + tags + '</div>' +
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

    function escapeHtml(value) {
      return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
  </script>
</body>
</html>`;
}
