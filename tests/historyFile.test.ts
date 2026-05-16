import { describe, expect, it } from 'vitest';
import { resolveFileHistoryTarget } from '../src/views/historyFile';

const rootPath = 'C:/work/tree';

describe('resolveFileHistoryTarget', () => {
  it('uses the active editor file when the command has no explicit URI', () => {
    expect(resolveFileHistoryTarget(rootPath, undefined, {
      scheme: 'file',
      fsPath: 'C:/work/tree/src/file.ts'
    })).toEqual({ relativePath: 'src/file.ts' });
  });

  it('uses an explicit command URI before the active editor URI', () => {
    expect(resolveFileHistoryTarget(rootPath, {
      scheme: 'file',
      fsPath: 'C:/work/tree/README.md'
    }, {
      scheme: 'file',
      fsPath: 'C:/work/tree/src/file.ts'
    })).toEqual({ relativePath: 'README.md' });
  });

  it('rejects non-file and outside-tree targets with short reasons', () => {
    expect(resolveFileHistoryTarget(rootPath, { scheme: 'untitled', fsPath: '' }, undefined)).toEqual({
      warning: 'Open a file inside the Bazaar tree first.'
    });
    expect(resolveFileHistoryTarget(rootPath, { scheme: 'file', fsPath: 'C:/other/file.ts' }, undefined)).toEqual({
      warning: 'The selected file is outside the Bazaar tree.'
    });
  });
});
