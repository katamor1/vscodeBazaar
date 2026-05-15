import * as vscode from 'vscode';
import type { BazaarClient } from '../bazaar/client';
import { buildGraph } from '../bazaar/graphModel';
import { revisionGraphId } from '../bazaar/revisionSpec';
import type { BazaarRevision, RevisionGraph } from '../bazaar/types';
import { resolveGraphRevisionMessage, type GraphMessage } from './graphMessage';

export class BazaarGraphView implements vscode.WebviewViewProvider, vscode.Disposable {
  private view: vscode.WebviewView | undefined;
  private revisions: BazaarRevision[] = [];
  private graph: RevisionGraph = { nodes: [], edges: [] };

  constructor(private readonly client: BazaarClient) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.onDidReceiveMessage(async (message: GraphMessage) => {
      const command = resolveGraphRevisionMessage(this.revisions, message);
      if (!command) {
        return;
      }
      if (command.command === 'refresh') {
        await this.refresh();
      } else if (command.command === 'showCommit') {
        await vscode.commands.executeCommand('bazaar.history.showCommit', command.revision);
      } else if (command.command === 'showDiff') {
        await vscode.commands.executeCommand('bazaar.history.showCommitDiff', command.revision, command.path);
      }
    });
    this.render();
  }

  async refresh(): Promise<void> {
    const config = vscode.workspace.getConfiguration('bazaar');
    this.revisions = await this.client.log({
      limit: config.get<number>('history.limit', 200),
      includeMerged: config.get<boolean>('history.includeMerged', true)
    });
    this.graph = buildGraph(this.revisions);
    this.render();
  }

  open(): void {
    vscode.commands.executeCommand('workbench.view.scm');
  }

  dispose(): void {
    this.view = undefined;
  }

  private render(): void {
    if (!this.view) {
      return;
    }

    this.view.webview.html = renderGraphHtml(this.graph, this.revisions);
  }
}

function renderGraphHtml(graph: RevisionGraph, revisions: BazaarRevision[]): string {
  const rowHeight = 42;
  const columnWidth = 70;
  const radius = 7;
  const width = Math.max(520, 360 + Math.max(0, ...graph.nodes.map((node) => node.x)) * columnWidth);
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
    return `<path d="M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}" fill="none" stroke="var(--vscode-descriptionForeground)" stroke-width="1.5" />`;
  }).join('');
  const nodeSvg = graph.nodes.map((node) => {
    const x = 24 + node.x * columnWidth;
    const y = 24 + node.y * rowHeight;
    const labelX = 52 + node.x * columnWidth;
    return `<g class="node" data-id="${escapeHtml(node.id)}">
      <circle cx="${x}" cy="${y}" r="${radius}" fill="var(--vscode-charts-blue)" />
      <text x="${labelX}" y="${y + 4}" fill="var(--vscode-foreground)">${escapeHtml(node.label)}</text>
      <text x="${labelX + 220}" y="${y + 4}" fill="var(--vscode-descriptionForeground)">${escapeHtml([...node.tags.map((tag) => `#${tag}`), node.branchNick].filter(Boolean).join(' '))}</text>
    </g>`;
  }).join('');
  const revisionJson = JSON.stringify(revisions.flatMap((revision) => {
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
  })).replace(/</g, '\\u003c');

  return `<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { padding: 0; margin: 0; color: var(--vscode-foreground); font-family: var(--vscode-font-family); }
    .toolbar { display: flex; gap: 6px; padding: 8px; border-bottom: 1px solid var(--vscode-panel-border); }
    button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; padding: 4px 8px; }
    .layout { display: grid; grid-template-columns: minmax(300px, 1fr) 280px; min-height: 0; }
    .detail { border-left: 1px solid var(--vscode-panel-border); padding: 10px; overflow: auto; }
    .detail h2 { margin: 0 0 6px; font-size: 13px; font-weight: 600; }
    .meta { color: var(--vscode-descriptionForeground); font-size: 12px; margin-bottom: 10px; }
    .files { display: flex; flex-direction: column; gap: 4px; }
    .file { text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    svg { display: block; width: 100%; height: ${height}px; }
    text { font-size: 12px; dominant-baseline: middle; }
    .node { cursor: pointer; }
    .node.selected circle { fill: var(--vscode-charts-orange); }
  </style>
</head>
<body>
  <div class="toolbar"><button id="refresh">Refresh</button><button id="diff">Diff Selected</button></div>
  <div class="layout">
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Bazaar revision graph">${edgeSvg}${nodeSvg}</svg>
    <aside class="detail" id="detail">Select a revision</aside>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const revisions = ${revisionJson};
    const byId = new Map(revisions.map((revision) => [revision.graphId, revision]));
    let selected;
    document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ command: 'refresh' }));
    document.getElementById('diff').addEventListener('click', () => selected && vscode.postMessage({ command: 'showDiff', revisionId: selected }));
    document.querySelectorAll('.node').forEach((node) => {
      node.addEventListener('click', () => {
        selected = node.dataset.id;
        document.querySelectorAll('.node').forEach((item) => item.classList.toggle('selected', item === node));
        renderDetail(byId.get(selected));
        vscode.postMessage({ command: 'showCommit', revisionId: selected });
      });
    });
    function renderDetail(revision) {
      if (!revision) {
        return;
      }
      const tags = revision.tags.map((tag) => '<span>#' + escapeHtml(tag) + '</span>').join(' ');
      const parents = revision.parents.length ? revision.parents.map(escapeHtml).join('<br>') : '(none)';
      const files = revision.changedPaths.length
        ? revision.changedPaths.map((file) => '<button class="file" data-file="' + escapeHtml(file) + '">' + escapeHtml(file) + '</button>').join('')
        : '<div class="meta">No changed paths in loaded log data.</div>';
      document.getElementById('detail').innerHTML =
        '<h2>' + escapeHtml(revision.revno + ' ' + firstLine(revision.message)) + '</h2>' +
        '<div class="meta">' + escapeHtml(revision.committer) + '<br>' + escapeHtml(revision.timestamp) + '<br>' + escapeHtml(revision.branchNick || '') + ' ' + tags + '</div>' +
        '<div class="meta">Parents<br>' + parents + '</div>' +
        '<div class="files">' + files + '</div>';
      document.querySelectorAll('.file').forEach((fileButton) => {
        fileButton.addEventListener('click', () => {
          vscode.postMessage({ command: 'showDiff', revisionId: selected, path: fileButton.dataset.file });
        });
      });
    }
    function firstLine(value) {
      return (value || '').split(/\\r?\\n/)[0] || '(no message)';
    }
    function escapeHtml(value) {
      return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
