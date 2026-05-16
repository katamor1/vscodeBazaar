export interface BazaarViewRefreshTarget {
  label: string;
  refresh: () => Promise<void> | void;
}

export interface BazaarRefreshableView {
  refresh: () => Promise<void> | void;
}

export interface BranchSwitchRefreshViews {
  sourceControl: BazaarRefreshableView;
  blame: BazaarRefreshableView;
  history: BazaarRefreshableView;
  branches: BazaarRefreshableView;
  tags: BazaarRefreshableView;
  shelves: BazaarRefreshableView;
  graph: BazaarRefreshableView;
}

export interface BazaarViewRefreshFailure {
  label: string;
  error: unknown;
}

export function createBranchSwitchRefreshTargets(views: BranchSwitchRefreshViews): BazaarViewRefreshTarget[] {
  return [
    { label: 'source control', refresh: () => views.sourceControl.refresh() },
    { label: 'blame', refresh: () => views.blame.refresh() },
    { label: 'history', refresh: () => views.history.refresh() },
    { label: 'branches', refresh: () => views.branches.refresh() },
    { label: 'tags', refresh: () => views.tags.refresh() },
    { label: 'shelves', refresh: () => views.shelves.refresh() },
    { label: 'graph', refresh: () => views.graph.refresh() }
  ];
}

export async function refreshBazaarViewTargets(
  targets: readonly BazaarViewRefreshTarget[]
): Promise<BazaarViewRefreshFailure[]> {
  const failures: BazaarViewRefreshFailure[] = [];

  for (const target of targets) {
    try {
      await target.refresh();
    } catch (error) {
      failures.push({ label: target.label, error });
    }
  }

  return failures;
}

export function formatViewRefreshFailure(failure: BazaarViewRefreshFailure): string {
  return `${failure.label}: ${formatUnknownError(failure.error)}`;
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
