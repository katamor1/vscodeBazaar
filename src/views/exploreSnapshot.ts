import { revisionGraphId } from '../bazaar/revisionSpec';
import type {
  BazaarBranch,
  BazaarChange,
  BazaarChangeKind,
  BazaarConflict,
  BazaarInfo,
  BazaarRevision,
  BazaarShelf,
  BazaarTag,
  RevisionGraph
} from '../bazaar/types';

export type BazaarExploreHealth = 'clean' | 'dirty' | 'conflict' | 'partial';
export type BazaarExploreStatusGroupId = BazaarChangeKind | 'conflict';

export interface BazaarExploreLoadError {
  source: string;
  message: string;
}

export interface BazaarExploreSnapshot {
  rootPath: string;
  loadedAt: string;
  changes: readonly BazaarChange[];
  conflicts: readonly BazaarConflict[];
  branches: readonly BazaarBranch[];
  tags: readonly BazaarTag[];
  shelves: readonly BazaarShelf[];
  revisions: readonly BazaarRevision[];
  graph: RevisionGraph;
  info: BazaarInfo;
  errors: readonly BazaarExploreLoadError[];
}

export interface BazaarExploreCounts {
  changes: number;
  conflicts: number;
  branches: number;
  tags: number;
  shelves: number;
  revisions: number;
  pendingMerges: number;
  unknown: number;
}

export interface BazaarExploreStatusItem {
  path: string;
  description: string;
  oldPath?: string;
}

export interface BazaarExploreStatusGroup {
  id: BazaarExploreStatusGroupId;
  label: string;
  items: readonly BazaarExploreStatusItem[];
}

export interface BazaarExploreRevisionItem {
  graphId: string;
  revno: string;
  revisionId: string;
  committer: string;
  branchNick: string;
  timestamp: string;
  message: string;
  summary: string;
  tags: readonly string[];
  parentIds: readonly string[];
  changedPaths: readonly string[];
}

export interface BazaarExploreInfoItem {
  label: string;
  value: string;
}

export interface BazaarExploreModel {
  rootPath: string;
  loadedAt: string;
  health: BazaarExploreHealth;
  headline: string;
  counts: BazaarExploreCounts;
  statusGroups: readonly BazaarExploreStatusGroup[];
  currentBranch?: BazaarBranch;
  branches: readonly BazaarBranch[];
  tags: readonly BazaarTag[];
  shelves: readonly BazaarShelf[];
  revisions: readonly BazaarExploreRevisionItem[];
  graph: RevisionGraph;
  infoItems: readonly BazaarExploreInfoItem[];
  errors: readonly BazaarExploreLoadError[];
}

const statusGroupOrder: BazaarExploreStatusGroupId[] = [
  'conflict',
  'pendingMerge',
  'modified',
  'added',
  'removed',
  'renamed',
  'unknown'
];

const statusLabels: Record<BazaarExploreStatusGroupId, string> = {
  conflict: '競合',
  pendingMerge: 'Pending Merge',
  modified: '変更',
  added: '追加',
  removed: '削除',
  renamed: '名前変更',
  unknown: '未追跡'
};

export function createEmptyBazaarExploreSnapshot(rootPath: string): BazaarExploreSnapshot {
  return {
    rootPath,
    loadedAt: '',
    changes: [],
    conflicts: [],
    branches: [],
    tags: [],
    shelves: [],
    revisions: [],
    graph: { nodes: [], edges: [] },
    info: {},
    errors: []
  };
}

export function createBazaarExploreModel(snapshot: BazaarExploreSnapshot): BazaarExploreModel {
  const counts = createCounts(snapshot);
  return {
    rootPath: snapshot.rootPath,
    loadedAt: snapshot.loadedAt,
    health: createHealth(snapshot),
    headline: createHeadline(snapshot),
    counts,
    statusGroups: createStatusGroups(snapshot.changes, snapshot.conflicts),
    currentBranch: snapshot.branches.find((branch) => branch.current),
    branches: snapshot.branches,
    tags: snapshot.tags,
    shelves: snapshot.shelves,
    revisions: snapshot.revisions.flatMap((revision) => {
      const graphId = revisionGraphId(revision);
      return graphId
        ? [{
            graphId,
            revno: revision.revno,
            revisionId: revision.revisionId,
            committer: revision.committer,
            branchNick: revision.branchNick,
            timestamp: revision.timestamp,
            message: revision.message,
            summary: firstLine(revision.message),
            tags: revision.tags,
            parentIds: revision.parentIds,
            changedPaths: revision.changedPaths ?? []
          }]
        : [];
    }),
    graph: snapshot.graph,
    infoItems: createInfoItems(snapshot.info),
    errors: snapshot.errors
  };
}

function createCounts(snapshot: BazaarExploreSnapshot): BazaarExploreCounts {
  return {
    changes: snapshot.changes.length,
    conflicts: snapshot.conflicts.length,
    branches: snapshot.branches.length,
    tags: snapshot.tags.length,
    shelves: snapshot.shelves.length,
    revisions: snapshot.revisions.length,
    pendingMerges: snapshot.changes.filter((change) => change.kind === 'pendingMerge').length,
    unknown: snapshot.changes.filter((change) => change.kind === 'unknown').length
  };
}

function createHealth(snapshot: BazaarExploreSnapshot): BazaarExploreHealth {
  if (snapshot.conflicts.length > 0) {
    return 'conflict';
  }
  if (snapshot.errors.length > 0) {
    return 'partial';
  }
  if (snapshot.changes.length > 0) {
    return 'dirty';
  }
  return 'clean';
}

function createHeadline(snapshot: BazaarExploreSnapshot): string {
  if (snapshot.conflicts.length > 0) {
    return '競合あり';
  }
  if (snapshot.errors.length > 0) {
    return '一部未読込';
  }
  if (snapshot.changes.length > 0) {
    return '変更あり';
  }
  return 'クリーン';
}

function createStatusGroups(
  changes: readonly BazaarChange[],
  conflicts: readonly BazaarConflict[]
): BazaarExploreStatusGroup[] {
  const grouped = new Map<BazaarExploreStatusGroupId, BazaarExploreStatusItem[]>(
    statusGroupOrder.map((id) => [id, []])
  );

  for (const conflict of conflicts) {
    grouped.get('conflict')?.push({
      path: conflict.path,
      description: conflict.description
    });
  }

  for (const change of changes) {
    grouped.get(change.kind)?.push({
      path: change.path,
      oldPath: change.oldPath,
      description: change.description ?? statusLabels[change.kind]
    });
  }

  return statusGroupOrder
    .map((id) => ({
      id,
      label: statusLabels[id],
      items: grouped.get(id) ?? []
    }))
    .filter((group) => group.items.length > 0);
}

function createInfoItems(info: BazaarInfo): BazaarExploreInfoItem[] {
  return [
    { label: 'Branch root', value: info.branchRoot },
    { label: 'Repository', value: info.repository },
    { label: 'Checkout root', value: info.checkoutRoot },
    { label: 'Checkout of branch', value: info.checkoutOfBranch },
    { label: 'Parent branch', value: info.parentBranch },
    { label: 'Push branch', value: info.pushBranch }
  ].filter((item): item is BazaarExploreInfoItem => Boolean(item.value));
}

function firstLine(value: string): string {
  return value.split(/\r?\n/)[0]?.trim() || '(メッセージなし)';
}
