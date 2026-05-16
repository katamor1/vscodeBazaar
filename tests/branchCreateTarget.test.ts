import { describe, expect, it } from 'vitest';
import {
  resolveBranchCreateTarget,
  validateBranchFolderName
} from '../src/views/branchCreateTarget';

describe('resolveBranchCreateTarget', () => {
  it('creates branches in the shared repository when it is outside the current root', () => {
    expect(resolveBranchCreateTarget('C:/repo/master', { repository: '..' }, 'feature')).toEqual({
      branchName: 'feature',
      toLocation: 'C:/repo/feature'
    });
  });

  it('creates sibling branches when repository metadata is unavailable', () => {
    expect(resolveBranchCreateTarget('C:/repo/master', {}, 'feature')).toEqual({
      branchName: 'feature',
      toLocation: 'C:/repo/feature'
    });
  });

  it('falls back to a sibling branch when repository metadata points inside the current root', () => {
    expect(resolveBranchCreateTarget('C:/repo/master', { repository: '.bzr/repository' }, 'feature')).toEqual({
      branchName: 'feature',
      toLocation: 'C:/repo/feature'
    });
  });

  it('blocks targets that would resolve to the current root even with case differences', () => {
    expect(resolveBranchCreateTarget('C:/Repo/Master', {}, 'master')).toEqual({
      warning: 'The Bazaar branch destination must be outside the current workspace.'
    });
  });
});

describe('validateBranchFolderName', () => {
  it('rejects empty, absolute, escaping, nested, and Windows-invalid names', () => {
    for (const value of ['', '../x', 'C:/x', 'feature/foo', 'feature\\foo', 'bad:name']) {
      expect(validateBranchFolderName(value)).toBe('Enter a simple branch folder name.');
    }
  });

  it('accepts a simple branch folder name after trimming whitespace', () => {
    expect(validateBranchFolderName('  feature-1  ')).toBeUndefined();
  });
});
