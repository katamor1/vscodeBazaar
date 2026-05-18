import type { BazaarCommandTrace } from './client';
import type { CommandResult } from './types';

export type BazaarTraceMode = 'off' | 'summary' | 'truncated' | 'full';

export interface BazaarCommandTraceFormatOptions {
  mode: BazaarTraceMode;
  maxOutputChars: number;
  maxOutputLines: number;
  omitLargeCommandOutput: boolean;
}

const largeOutputCommands = new Set([
  'annotate',
  'cat',
  'check',
  'diff',
  'log',
  'ls',
  'missing',
  'status'
]);

export function formatBazaarCommandTrace(
  trace: BazaarCommandTrace,
  options: BazaarCommandTraceFormatOptions = defaultTraceFormatOptions()
): string[] {
  if (options.mode === 'off') {
    return [];
  }

  const failed = trace.result.exitCode !== 0;
  const omitLargeStdout = options.omitLargeCommandOutput && isLargeOutputCommand(trace.args ?? []) && !failed;
  return [
    '=== Bazaar コマンド ===',
    `cwd: ${trace.cwd}`,
    `command: ${trace.commandLine}`,
    `exit code: ${trace.result.exitCode}`,
    ...formatOutputStream('stdout', trace.result.stdout, options, omitLargeStdout),
    ...formatOutputStream('stderr', trace.result.stderr, options, false)
  ];
}

export function formatCommandErrorOutput(
  result: CommandResult,
  options: Pick<BazaarCommandTraceFormatOptions, 'maxOutputChars' | 'maxOutputLines'>
): string[] {
  const truncateOptions: BazaarCommandTraceFormatOptions = {
    mode: 'truncated',
    omitLargeCommandOutput: false,
    maxOutputChars: options.maxOutputChars,
    maxOutputLines: options.maxOutputLines
  };
  return [
    ...formatOutputStream('stderr', result.stderr, truncateOptions, false),
    ...formatOutputStream('stdout', result.stdout, truncateOptions, false)
  ];
}

export function defaultTraceFormatOptions(): BazaarCommandTraceFormatOptions {
  return {
    mode: 'summary',
    maxOutputChars: 4000,
    maxOutputLines: 80,
    omitLargeCommandOutput: true
  };
}

function formatOutputStream(
  label: string,
  value: string,
  options: BazaarCommandTraceFormatOptions,
  omitBody: boolean
): string[] {
  const text = value.trimEnd();
  if (!text) {
    return [`${label}: (なし)`];
  }

  const stats = outputStats(text);
  if (options.mode === 'summary' || omitBody) {
    return [`${label}: (${stats.lines} lines, ${stats.chars} chars; body omitted)`];
  }

  if (options.mode === 'full') {
    return [`${label}:`, text];
  }

  const truncated = truncateText(text, options.maxOutputLines, options.maxOutputChars);
  return [
    `${label}: (${stats.lines} lines, ${stats.chars} chars)`,
    truncated.text,
    ...(truncated.truncated ? [`... truncated; original was ${stats.lines} lines, ${stats.chars} chars`] : [])
  ];
}

function isLargeOutputCommand(args: readonly string[]): boolean {
  const command = args[0];
  return command ? largeOutputCommands.has(command) : false;
}

function outputStats(text: string): { lines: number; chars: number } {
  return {
    lines: text.split(/\r?\n/).length,
    chars: text.length
  };
}

function truncateText(text: string, maxLines: number, maxChars: number): { text: string; truncated: boolean } {
  let result = text;
  let truncated = false;

  if (maxLines > 0) {
    const lines = result.split(/\r?\n/);
    if (lines.length > maxLines) {
      result = lines.slice(0, maxLines).join('\n');
      truncated = true;
    }
  }

  if (maxChars > 0 && result.length > maxChars) {
    result = result.slice(0, maxChars);
    truncated = true;
  }

  return { text: result, truncated };
}
