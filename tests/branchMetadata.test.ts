import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  discoverSiblingBranchMetadata,
  inspectLocalBranchMetadata,
  resolveHistoryFallbackSource
} from '../src/bazaar/branchMetadata';

const tmpRoots: string[] = [];

describe('Bazaar branch filesystem metadata', () => {
  afterEach(async () => {
    for (const root of tmpRoots.splice(0)) {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('marks a self-referencing branch reference as degraded metadata', async () => {
    const root = await makeTmpRoot();
    const trunk = path.join(root, 'trunk');
    await makeBranch(trunk, {
      referenceLocation: pathToFileURL(trunk).href
    });

    await expect(inspectLocalBranchMetadata(trunk)).resolves.toMatchObject({
      name: 'trunk',
      current: true,
      isWorkingTree: true,
      isSelfReferentialReference: true
    });
  });

  it('discovers sibling Bazaar branches and excludes the shared repository root itself', async () => {
    const root = await makeTmpRoot();
    await fs.mkdir(path.join(root, '.bzr'), { recursive: true });
    await makeBranch(path.join(root, 'trunk'), { referenceLocation: pathToFileURL(path.join(root, 'trunk')).href });
    await makeBranch(path.join(root, 'branch1'), { parentLocation: '../trunk' });
    await makeBranch(path.join(root, 'branch2'), { parentLocation: '../branch1' });

    const branches = await discoverSiblingBranchMetadata(path.join(root, 'trunk'));

    expect(branches.map((branch) => ({
      name: branch.name,
      current: branch.current,
      isWorkingTree: branch.isWorkingTree
    }))).toEqual([
      { name: 'trunk', current: true, isWorkingTree: true },
      { name: 'branch1', current: false, isWorkingTree: true },
      { name: 'branch2', current: false, isWorkingTree: true }
    ]);
  });

  it('normalizes parent and push locations from branch.conf', async () => {
    const root = await makeTmpRoot();
    const branch = path.join(root, 'branch2');
    await makeBranch(branch, {
      parentLocation: '../branch1/',
      pushLocation: pathToFileURL(path.join(root, 'branch1')).href
    });

    await expect(inspectLocalBranchMetadata(branch)).resolves.toMatchObject({
      parentLocation: normalize(path.join(root, 'branch1')),
      pushLocation: normalize(path.join(root, 'branch1'))
    });
  });

  it('chooses the sibling branch that points back to a degraded trunk as history fallback', async () => {
    const root = await makeTmpRoot();
    const trunk = path.join(root, 'trunk');
    await makeBranch(trunk, { referenceLocation: pathToFileURL(trunk).href });
    await makeBranch(path.join(root, 'branch1'), { parentLocation: '../trunk' });
    await makeBranch(path.join(root, 'branch2'), { parentLocation: '../branch1' });

    await expect(resolveHistoryFallbackSource(trunk)).resolves.toMatchObject({
      name: 'branch1',
      path: normalize(path.join(root, 'branch1'))
    });
  });
});

async function makeTmpRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-bazaar-metadata-'));
  tmpRoots.push(root);
  return root;
}

async function makeBranch(
  branchPath: string,
  options: {
    parentLocation?: string;
    pushLocation?: string;
    referenceLocation?: string;
  } = {}
): Promise<void> {
  await fs.mkdir(path.join(branchPath, '.bzr', 'branch'), { recursive: true });
  await fs.mkdir(path.join(branchPath, '.bzr', 'checkout'), { recursive: true });
  await fs.writeFile(
    path.join(branchPath, '.bzr', 'branch', 'format'),
    options.referenceLocation ? 'Bazaar-NG Branch Reference Format 1\n' : 'Bazaar Branch Format 7\n'
  );
  if (options.referenceLocation) {
    await fs.writeFile(path.join(branchPath, '.bzr', 'branch', 'location'), `${options.referenceLocation}\n`);
  }
  const config = [
    options.parentLocation ? `parent_location = ${options.parentLocation}` : undefined,
    options.pushLocation ? `push_location = ${options.pushLocation}` : undefined
  ].filter(Boolean).join('\n');
  if (config) {
    await fs.writeFile(path.join(branchPath, '.bzr', 'branch', 'branch.conf'), `${config}\n`);
  }
}

function normalize(value: string): string {
  return path.win32.resolve(value).replace(/\\/g, '/');
}
