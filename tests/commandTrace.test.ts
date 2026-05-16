import { describe, expect, it } from 'vitest';
import { formatBazaarCommandTrace } from '../src/bazaar/commandTrace';

describe('formatBazaarCommandTrace', () => {
  it('includes the full command line and complete response sections', () => {
    expect(formatBazaarCommandTrace({
      cwd: 'C:/repo',
      commandLine: 'bzr status',
      result: {
        stdout: 'modified:\n  src/app.ts\n',
        stderr: 'warning: stale lock ignored\n',
        exitCode: 0
      }
    })).toEqual([
      '=== Bazaar コマンド ===',
      'cwd: C:/repo',
      'command: bzr status',
      'exit code: 0',
      'stdout:',
      'modified:\n  src/app.ts',
      'stderr:',
      'warning: stale lock ignored'
    ]);
  });

  it('marks empty stdout and stderr explicitly', () => {
    expect(formatBazaarCommandTrace({
      cwd: 'C:/repo',
      commandLine: 'bzr nick',
      result: {
        stdout: '',
        stderr: '',
        exitCode: 0
      }
    })).toContain('(なし)');
  });
});
