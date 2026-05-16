import type { BazaarCommandTrace } from './client';

export function formatBazaarCommandTrace(trace: BazaarCommandTrace): string[] {
  return [
    '=== Bazaar コマンド ===',
    `cwd: ${trace.cwd}`,
    `command: ${trace.commandLine}`,
    `exit code: ${trace.result.exitCode}`,
    'stdout:',
    trace.result.stdout.trimEnd() || '(なし)',
    'stderr:',
    trace.result.stderr.trimEnd() || '(なし)'
  ];
}
