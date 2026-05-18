import { describe, expect, it } from 'vitest';
import {
  formatBazaarCommandTrace,
  formatCommandErrorOutput
} from '../src/bazaar/commandTrace';

const trace = {
  cwd: 'C:/repo',
  args: ['status'],
  commandLine: 'bzr status',
  result: {
    stdout: 'modified:\n  src/app.ts\n',
    stderr: 'warning: stale lock ignored\n',
    exitCode: 0
  }
};

describe('formatBazaarCommandTrace', () => {
  it('summarizes command output by default', () => {
    expect(formatBazaarCommandTrace(trace)).toEqual([
      '=== Bazaar コマンド ===',
      'cwd: C:/repo',
      'command: bzr status',
      'exit code: 0',
      'stdout: (2 lines, 22 chars; body omitted)',
      'stderr: (1 lines, 27 chars; body omitted)'
    ]);
  });

  it('supports truncated and full trace modes', () => {
    expect(formatBazaarCommandTrace(trace, {
      mode: 'truncated',
      maxOutputChars: 8,
      maxOutputLines: 1,
      omitLargeCommandOutput: false
    })).toContain('... truncated; original was 2 lines, 22 chars');

    expect(formatBazaarCommandTrace(trace, {
      mode: 'full',
      maxOutputChars: 0,
      maxOutputLines: 0,
      omitLargeCommandOutput: false
    })).toContain('modified:\n  src/app.ts');
  });

  it('can turn trace output off and marks empty streams explicitly', () => {
    expect(formatBazaarCommandTrace(trace, {
      mode: 'off',
      maxOutputChars: 0,
      maxOutputLines: 0,
      omitLargeCommandOutput: true
    })).toEqual([]);

    expect(formatBazaarCommandTrace({
      ...trace,
      args: ['nick'],
      commandLine: 'bzr nick',
      result: { stdout: '', stderr: '', exitCode: 0 }
    })).toContain('stdout: (なし)');
  });

  it('truncates command error output', () => {
    expect(formatCommandErrorOutput({
      stdout: 'line1\nline2\nline3',
      stderr: 'error detail',
      exitCode: 3
    }, {
      maxOutputChars: 20,
      maxOutputLines: 2
    })).toEqual([
      'stderr: (1 lines, 12 chars)',
      'error detail',
      'stdout: (3 lines, 17 chars)',
      'line1\nline2',
      '... truncated; original was 3 lines, 17 chars'
    ]);
  });
});
