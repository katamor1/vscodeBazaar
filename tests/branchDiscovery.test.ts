import { describe, expect, it } from 'vitest';
import {
  includeCheckoutRootBranch,
  mergeDiscoveredBranches,
  resolveBranchDiscoveryLocations
} from '../src/views/branchDiscovery';

describe('resolveBranchDiscoveryLocations', () => {
  it('uses the shared repository and avoids duplicate sibling discovery roots', () => {
    expect(resolveBranchDiscoveryLocations('C:/repo/master', { repository: '..' })).toEqual([
      'C:/repo'
    ]);
  });

  it('uses the checkout sibling when repository metadata is unavailable', () => {
    expect(resolveBranchDiscoveryLocations('C:/repo/master', {})).toEqual([
      'C:/repo'
    ]);
  });

  it('skips repository metadata that points inside the current root', () => {
    expect(resolveBranchDiscoveryLocations('C:/repo/master', { repository: '.bzr/repository' })).toEqual([
      'C:/repo'
    ]);
  });

  it('includes extension-created branch parent locations after normal discovery roots', () => {
    expect(resolveBranchDiscoveryLocations('C:/repo/master', {}, ['D:/branches'])).toEqual([
      'C:/repo',
      'D:/branches'
    ]);
  });

  it('deduplicates locations with Windows case-insensitive comparison', () => {
    expect(resolveBranchDiscoveryLocations('C:/Repo/Master', { repository: '..' }, ['c:/repo'])).toEqual([
      'C:/Repo'
    ]);
  });
});

describe('mergeDiscoveredBranches', () => {
  it('resolves branch paths relative to the discovery location', () => {
    expect(mergeDiscoveredBranches('C:/repo/master', [
      {
        location: 'C:/repo',
        branches: [
          { name: 'master', path: 'master', current: true },
          { name: 'feature', path: 'feature', current: false }
        ]
      }
    ])).toEqual([
      { name: 'master', path: 'C:/repo/master', current: true },
      { name: 'feature', path: 'C:/repo/feature', current: false }
    ]);
  });

  it('keeps the active root for Bazaar fallback current branch entries', () => {
    expect(mergeDiscoveredBranches('C:/repo/master', [
      {
        location: 'C:/repo',
        branches: [
          { name: 'master', path: '.', current: true }
        ]
      }
    ])).toEqual([
      { name: 'master', path: 'C:/repo/master', current: true }
    ]);
  });

  it('deduplicates branches by normalized path and lets the current marker win', () => {
    expect(mergeDiscoveredBranches('C:/repo/master', [
      {
        location: 'C:/repo',
        branches: [
          { name: 'master', path: 'master', current: false },
          { name: 'feature', path: 'feature', current: false }
        ]
      },
      {
        location: 'c:/repo',
        branches: [
          { name: 'master', path: 'MASTER', current: true }
        ]
      }
    ])).toEqual([
      { name: 'master', path: 'C:/repo/master', current: true },
      { name: 'feature', path: 'C:/repo/feature', current: false }
    ]);
  });

  it('shortens absolute Bazaar branch display paths to folder names', () => {
    expect(mergeDiscoveredBranches('C:/repo/master', [
      {
        location: 'C:/repo',
        branches: [
          { name: 'C:/repo/feature', path: 'C:/repo/feature', current: false }
        ]
      }
    ])).toEqual([
      { name: 'feature', path: 'C:/repo/feature', current: false }
    ]);
  });
});

describe('includeCheckoutRootBranch', () => {
  it('keeps a lightweight checkout root visible even when Bazaar branch discovery omits it', () => {
    expect(includeCheckoutRootBranch('C:/repo/trunk', { checkoutRoot: '.' }, [
      { name: 'branch1', path: 'C:/repo/branch1', current: true }
    ])).toEqual([
      { name: 'branch1', path: 'C:/repo/branch1', current: true },
      { name: 'trunk', path: 'C:/repo/trunk', current: false }
    ]);
  });

  it('does not duplicate a checkout root that is already listed', () => {
    expect(includeCheckoutRootBranch('C:/repo/trunk', { checkoutRoot: '.' }, [
      { name: 'trunk', path: 'C:/repo/trunk', current: true }
    ])).toEqual([
      { name: 'trunk', path: 'C:/repo/trunk', current: true }
    ]);
  });
});
