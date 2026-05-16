export const PENDING_MERGE_PATH = 'Pending merge';

export type BazaarChangeKind = 'modified' | 'added' | 'removed' | 'renamed' | 'unknown' | 'pendingMerge';

export interface BazaarChange {
  path: string;
  kind: BazaarChangeKind;
  oldPath?: string;
  description?: string;
}

export interface BazaarConflict {
  path: string;
  description: string;
}

export type BazaarShelveAction = 'apply' | 'keep' | 'delete-only';
export type BazaarConflictAction = 'done' | 'take-this' | 'take-other';
export type BazaarCleanTreeKind = 'unknown' | 'ignored' | 'detritus';

export interface BazaarShelf {
  id: string;
  message: string;
}

export interface BazaarCleanTreeCandidate {
  path: string;
  kind: BazaarCleanTreeKind;
}

export interface BazaarDangerousOperation {
  id: string;
  label: string;
  target: string;
}

export interface BazaarRevisionDocument {
  path: string;
  revision: string;
}

export interface BazaarRevision {
  revno: string;
  revisionId: string;
  parentIds: string[];
  tags: string[];
  committer: string;
  branchNick: string;
  timestamp: string;
  message: string;
  depth: number;
  changedPaths?: string[];
}

export interface BazaarTag {
  name: string;
  revision: string;
}

export interface BazaarBranch {
  name: string;
  path: string;
  current: boolean;
}

export interface BazaarInfo {
  branchRoot?: string;
  repository?: string;
  checkoutRoot?: string;
  checkoutOfBranch?: string;
}

export interface BazaarAnnotation {
  line: number;
  revno: string;
  author: string;
  date?: string;
  text: string;
}

export interface GraphNode {
  id: string;
  revno: string;
  label: string;
  branchNick: string;
  tags: string[];
  x: number;
  y: number;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface RevisionGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type RunCommand = (args: readonly string[]) => Promise<CommandResult>;
