import { findDotBzrRoot } from './rootFinder';

export interface BazaarRootClient {
  root(): Promise<string>;
}

export interface BazaarRootOutput {
  appendLine(value: string): void;
}

export type LocalRootFinder = (workspacePath: string) => Promise<string | undefined>;

export async function findFirstBazaarWorkspaceRoot(
  workspacePaths: readonly string[],
  createClient: (workspacePath: string) => BazaarRootClient,
  output: BazaarRootOutput,
  findLocalRoot: LocalRootFinder = findDotBzrRoot
): Promise<string | undefined> {
  for (const workspacePath of workspacePaths) {
    const root = await findBazaarRootForWorkspace(workspacePath, createClient(workspacePath), output, findLocalRoot);
    if (root) {
      return root;
    }
  }
  return undefined;
}

async function findBazaarRootForWorkspace(
  workspacePath: string,
  client: BazaarRootClient,
  output: BazaarRootOutput,
  findLocalRoot: LocalRootFinder
): Promise<string | undefined> {
  const localRoot = await findLocalRoot(workspacePath);
  if (localRoot) {
    return localRoot;
  }

  try {
    return await client.root();
  } catch (error) {
    output.appendLine(`${workspacePath} に Bazaar 作業ツリーが見つかりません。`);
    output.appendLine(`bzr root が失敗しました: ${formatError(error)}`);
    return undefined;
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
