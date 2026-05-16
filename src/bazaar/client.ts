import { spawn } from 'node:child_process';
import type {
  BazaarAnnotation,
  BazaarBranch,
  BazaarChange,
  BazaarCleanTreeCandidate,
  BazaarCleanTreeKind,
  BazaarConflictAction,
  BazaarInfo,
  BazaarRevision,
  BazaarShelf,
  BazaarShelveAction,
  BazaarTag,
  CommandResult,
  RunCommand
} from './types';
import { parseConflicts, parseStatus, parseUnknownLs } from './statusParser';
import { decodeBazaarOutput } from './outputEncoding';
import { parseBazaarLogXml } from './historyParser';
import {
  parseAnnotations,
  parseBranches,
  parseCleanTreeDryRun,
  parseConflictTextPaths,
  parseInfo,
  parseShelves,
  parseTags
} from './metadataParser';
import { requireRevisionSpec } from './revisionSpec';

export interface BazaarClientOptions {
  cwd: string;
  cliPath: string;
  run?: RunCommand;
  onCommandComplete?: (trace: BazaarCommandTrace) => void;
}

export interface BazaarCommandTrace {
  cwd: string;
  commandLine: string;
  result: CommandResult;
}

export interface BazaarLogOptions {
  limit?: number;
  includeMerged?: boolean;
  path?: string;
  match?: string;
}

export interface BazaarCommitOptions {
  wholeTree?: boolean;
}

export class BazaarCommandError extends Error {
  constructor(
    readonly args: readonly string[],
    readonly result: CommandResult
  ) {
    super(formatCommandError(args, result));
    this.name = 'BazaarCommandError';
  }
}

export class BazaarClient {
  private readonly runCommand: RunCommand;
  private commandQueue: Promise<void> = Promise.resolve();

  constructor(private readonly options: BazaarClientOptions) {
    this.runCommand = options.run ?? ((args) => runProcess(options.cliPath, args, options.cwd));
  }

  async root(): Promise<string> {
    const result = await this.checked(['root']);
    return result.stdout.trim();
  }

  async status(): Promise<BazaarChange[]> {
    try {
      const result = await this.checked(['status']);
      return parseStatus(result.stdout);
    } catch (error) {
      if (!isMaximumRecursionError(error)) {
        throw error;
      }
      return this.statusFallbackForRecursionError();
    }
  }

  async conflicts() {
    try {
      const result = await this.checked(['conflicts'], [0, 1]);
      return parseConflicts(result.stdout);
    } catch (error) {
      if (isMaximumRecursionError(error)) {
        return [];
      }
      throw error;
    }
  }

  async prepareIncludedForCommit(changes: readonly BazaarChange[]): Promise<void> {
    const unknownPaths = changes
      .filter((change) => change.kind === 'unknown')
      .map((change) => change.path);

    if (unknownPaths.length > 0) {
      await this.checked(['add', ...unknownPaths]);
    }
  }

  async commit(message: string, paths: readonly string[], options: BazaarCommitOptions = {}): Promise<void> {
    if (paths.length === 0 && !options.wholeTree) {
      throw new Error('No included files to commit.');
    }

    await this.checked(['commit', '-m', message, ...paths]);
  }

  async revert(paths: readonly string[]): Promise<void> {
    if (paths.length === 0) {
      throw new Error('No files to revert.');
    }

    await this.checked(['revert', ...paths]);
  }

  async pull(): Promise<void> {
    await this.checked(['pull']);
  }

  async missing(): Promise<string> {
    const result = await this.checked(['missing'], [0, 1]);
    return result.stdout || result.stderr;
  }

  async mergeParent(): Promise<string> {
    const result = await this.checked(['merge'], [0, 1]);
    return result.stdout || result.stderr;
  }

  async push(): Promise<void> {
    try {
      await this.checked(['push']);
    } catch (error) {
      if (isNoPushLocationKnownError(error)) {
        await this.checked(['push', ':parent']);
        return;
      }
      throw error;
    }
  }

  async resolve(path: string): Promise<void> {
    await this.checked(['resolve', path]);
  }

  async resolveConflict(path: string, action: BazaarConflictAction = 'done'): Promise<void> {
    await this.checked(['resolve', `--${action}`, path]);
  }

  async resolveAll(): Promise<void> {
    await this.checked(['resolve', '--all']);
  }

  async resolveAuto(): Promise<void> {
    await this.checked(['resolve', '--auto']);
  }

  async catBasis(path: string): Promise<string> {
    const result = await this.checked(['cat', '-r', '-1', path]);
    return result.stdout;
  }

  async catAtRevision(revision: string, path: string): Promise<string> {
    const revisionSpec = requireRevisionSpec(revision);
    const result = await this.checked(['cat', '-r', revisionSpec, '--', path]);
    return result.stdout;
  }

  async diff(path: string): Promise<string> {
    const result = await this.checked(['diff', path], [0, 1]);
    return result.stdout || result.stderr;
  }

  async diffChange(revision: string, path?: string): Promise<string> {
    const args = ['diff', '-c', requireRevisionSpec(revision)];
    if (path) {
      args.push(path);
    }
    const result = await this.checked(args, [0, 1]);
    return result.stdout || result.stderr;
  }

  async log(options: BazaarLogOptions = {}): Promise<BazaarRevision[]> {
    try {
      const result = await this.checked(logArgs(options));
      return parseBazaarLogXml(result.stdout);
    } catch (error) {
      if (isMaximumRecursionError(error)) {
        return [];
      }
      throw error;
    }
  }

  async logAt(target: string, options: BazaarLogOptions = {}): Promise<BazaarRevision[]> {
    try {
      const result = await this.checked(logArgs(options, target));
      return parseBazaarLogXml(result.stdout);
    } catch (error) {
      if (isMaximumRecursionError(error)) {
        return [];
      }
      throw error;
    }
  }

  async logRevision(revision: string, path?: string): Promise<BazaarRevision | undefined> {
    const args = ['log', '--xml', '--show-ids', '-v', '-r', requireRevisionSpec(revision)];
    if (path) {
      args.push(path);
    }
    try {
      const result = await this.checked(args);
      return parseBazaarLogXml(result.stdout)[0];
    } catch (error) {
      if (isMaximumRecursionError(error)) {
        return undefined;
      }
      throw error;
    }
  }

  async annotate(path: string): Promise<BazaarAnnotation[]> {
    const result = await this.checked(['annotate', '--all', '--long', path]);
    return parseAnnotations(result.stdout);
  }

  async conflictsText(): Promise<string[]> {
    try {
      const result = await this.checked(['conflicts', '--text'], [0, 1]);
      return parseConflictTextPaths(result.stdout);
    } catch (error) {
      if (isMaximumRecursionError(error)) {
        return [];
      }
      throw error;
    }
  }

  async shelves(): Promise<BazaarShelf[]> {
    try {
      const result = await this.checked(['shelve', '--list'], [0, 1]);
      return parseShelves(result.stdout);
    } catch (error) {
      if (isMaximumRecursionError(error)) {
        return [];
      }
      throw error;
    }
  }

  async shelve(paths: readonly string[], message?: string): Promise<void> {
    if (paths.length === 0) {
      throw new Error('No files to shelve.');
    }
    const args = ['shelve'];
    if (message) {
      args.push('-m', message);
    }
    args.push(...paths);
    await this.checked(args);
  }

  async shelveAll(message?: string): Promise<void> {
    const args = ['shelve', '--all'];
    if (message) {
      args.push('-m', message);
    }
    await this.checked(args);
  }

  async unshelvePreview(id: string): Promise<string> {
    const result = await this.checked(['unshelve', id, '--preview'], [0, 1]);
    return result.stdout || result.stderr;
  }

  async unshelveApply(id: string): Promise<void> {
    await this.unshelve(id, 'apply');
  }

  async unshelveKeep(id: string): Promise<void> {
    await this.unshelve(id, 'keep');
  }

  async unshelveDelete(id: string): Promise<void> {
    await this.unshelve(id, 'delete-only');
  }

  async revertAll(): Promise<void> {
    await this.checked(['revert']);
  }

  async forgetMerges(): Promise<void> {
    await this.checked(['revert', '--forget-merges']);
  }

  async cleanTreeDryRun(kinds: readonly BazaarCleanTreeKind[]): Promise<BazaarCleanTreeCandidate[]> {
    const candidates: BazaarCleanTreeCandidate[] = [];
    for (const kind of kinds) {
      const result = await this.checked(['clean-tree', '--dry-run', cleanTreeFlag(kind)], [0, 1]);
      candidates.push(...parseCleanTreeDryRun(result.stdout || result.stderr, kind));
    }
    return candidates;
  }

  async cleanTreeRun(kinds: readonly BazaarCleanTreeKind[]): Promise<void> {
    if (kinds.length === 0) {
      throw new Error('Choose at least one clean-tree kind.');
    }
    await this.checked(['clean-tree', '--force', ...kinds.map(cleanTreeFlag)]);
  }

  async uncommitDryRun(revision?: string): Promise<string> {
    const result = await this.checked(uncommitArgs(true, revision), [0, 1]);
    return result.stdout || result.stderr;
  }

  async uncommitRun(revision?: string): Promise<void> {
    await this.checked(uncommitArgs(false, revision));
  }

  async breakLock(location = '.'): Promise<void> {
    await this.checked(['break-lock', '--force', location]);
  }

  async checkTree(): Promise<string> {
    const result = await this.checked(['check'], [0, 1]);
    return result.stdout || result.stderr;
  }

  async tags(): Promise<BazaarTag[]> {
    try {
      const result = await this.checked(['tags']);
      return parseTags(result.stdout);
    } catch (error) {
      if (isMaximumRecursionError(error)) {
        return [];
      }
      throw error;
    }
  }

  async createTag(name: string, revision?: string, force = false): Promise<void> {
    const args = ['tag'];
    if (force) {
      args.push('--force');
    }
    if (revision) {
      args.push('-r', requireRevisionSpec(revision));
    }
    args.push(name);
    await this.checked(args);
  }

  async deleteTag(name: string): Promise<void> {
    await this.checked(['tag', '--delete', name]);
  }

  async nick(): Promise<string> {
    const result = await this.checked(['nick']);
    return result.stdout.trim();
  }

  async info(): Promise<BazaarInfo> {
    try {
      const result = await this.checked(['info']);
      return parseInfo(result.stdout);
    } catch (error) {
      if (isMaximumRecursionError(error)) {
        return {};
      }
      throw error;
    }
  }

  async infoText(): Promise<string> {
    try {
      const result = await this.checked(['info']);
      return result.stdout || result.stderr;
    } catch (error) {
      if (isMaximumRecursionError(error)) {
        return recursionFallbackText('info');
      }
      throw error;
    }
  }

  async branches(location = '.'): Promise<BazaarBranch[]> {
    try {
      const branchOutput = await this.checked(['branches', '--recursive', location]);
      const currentNick = await this.nick();
      return parseBranches(branchOutput.stdout, currentNick);
    } catch (error) {
      if (isMaximumRecursionError(error)) {
        return this.currentBranchFallbackForRecursionError();
      }
      throw error;
    }
  }

  async createBranch(fromLocation: string, toLocation: string): Promise<void> {
    await this.checked(['branch', fromLocation, toLocation]);
  }

  async switchBranch(location: string, force = false): Promise<void> {
    const args = ['switch'];
    if (force) {
      args.push('--force');
    }
    args.push(location);
    await this.checked(args);
  }

  async removeBranch(location: string, force = false): Promise<void> {
    const args = ['remove-branch'];
    if (force) {
      args.push('--force');
    }
    args.push(location);
    await this.checked(args);
  }

  private async unshelve(id: string, action: BazaarShelveAction): Promise<void> {
    await this.checked(['unshelve', id, `--${action}`]);
  }

  private async statusFallbackForRecursionError(): Promise<BazaarChange[]> {
    let versionedChanges: BazaarChange[];
    try {
      const versionedResult = await this.checked(['status', '--versioned', '--no-classify']);
      versionedChanges = parseStatus(versionedResult.stdout);
    } catch (error) {
      if (isMaximumRecursionError(error)) {
        return [];
      }
      throw error;
    }

    try {
      const unknownResult = await this.checked(['ls', '--unknown', '--from-root'], [0, 1]);
      return [...versionedChanges, ...parseUnknownLs(unknownResult.stdout)];
    } catch (error) {
      if (isMaximumRecursionError(error)) {
        return versionedChanges;
      }
      throw error;
    }
  }

  private async currentBranchFallbackForRecursionError(): Promise<BazaarBranch[]> {
    try {
      return parseBranches('', await this.nick());
    } catch {
      return [];
    }
  }

  private async checked(args: readonly string[], allowedExitCodes: readonly number[] = [0]): Promise<CommandResult> {
    const result = await this.enqueueCommand(() => this.runLoggedCommand(args));
    if (!allowedExitCodes.includes(result.exitCode)) {
      throw new BazaarCommandError(args, result);
    }
    return result;
  }

  private async runLoggedCommand(args: readonly string[]): Promise<CommandResult> {
    const result = await this.runCommand(args);
    this.reportCommandComplete(args, result);
    return result;
  }

  private reportCommandComplete(args: readonly string[], result: CommandResult): void {
    try {
      this.options.onCommandComplete?.({
        cwd: this.options.cwd,
        commandLine: formatBazaarCommandLine(this.options.cliPath, args),
        result
      });
    } catch {
      // Command tracing is diagnostic-only and must not change Bazaar behavior.
    }
  }

  private enqueueCommand<T>(task: () => Promise<T>): Promise<T> {
    const runAfterPrevious = this.commandQueue.then(task, task);
    this.commandQueue = runAfterPrevious.then(
      () => undefined,
      () => undefined
    );
    return runAfterPrevious;
  }
}

function isMaximumRecursionError(error: unknown): boolean {
  if (!(error instanceof BazaarCommandError)) {
    return false;
  }
  const output = `${error.result.stderr}\n${error.result.stdout}`.toLowerCase();
  return output.includes('maximum recursion depth exceeded');
}

function isNoPushLocationKnownError(error: unknown): boolean {
  if (!(error instanceof BazaarCommandError)) {
    return false;
  }
  if (error.args.length !== 1 || error.args[0] !== 'push') {
    return false;
  }
  const output = `${error.result.stderr}\n${error.result.stdout}`.toLowerCase();
  return output.includes('no push location known or specified') && output.includes('bzr push :parent');
}

export function isPullDivergedError(error: unknown): boolean {
  if (!(error instanceof BazaarCommandError)) {
    return false;
  }
  if (error.args.length !== 1 || error.args[0] !== 'pull') {
    return false;
  }
  const output = `${error.result.stderr}\n${error.result.stdout}`.toLowerCase();
  return output.includes('these branches have diverged') && output.includes('merge command');
}

function recursionFallbackText(command: string): string {
  return `bzr ${command} unavailable: Bazaar hit maximum recursion depth while opening branch metadata.`;
}

function cleanTreeFlag(kind: BazaarCleanTreeKind): string {
  return `--${kind}`;
}

function uncommitArgs(dryRun: boolean, revision?: string): string[] {
  const args = ['uncommit'];
  if (dryRun) {
    args.push('--dry-run', '--force', '--verbose');
  } else {
    args.push('--force');
  }
  if (revision) {
    args.push('-r', requireRevisionSpec(revision));
  }
  return args;
}

function logArgs(options: BazaarLogOptions, target?: string): string[] {
  const args = ['log', '--xml', '--show-ids', '-v'];
  if (options.limit) {
    args.push('--limit', String(options.limit));
  }
  if (options.includeMerged) {
    args.push('--include-merged');
  }
  if (options.match) {
    args.push('--match', options.match);
  }
  if (target) {
    args.push(target);
  } else if (options.path) {
    args.push(options.path);
  }
  return args;
}

function runProcess(cliPath: string, args: readonly string[], cwd: string): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cliPath, args, {
      cwd,
      windowsHide: true
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });
    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve({
        stdout: decodeBazaarOutput(Buffer.concat(stdoutChunks)),
        stderr: decodeBazaarOutput(Buffer.concat(stderrChunks)),
        exitCode: exitCode ?? 1
      });
    });
  });
}

function formatBazaarCommandLine(cliPath: string, args: readonly string[]): string {
  return [cliPath, ...args].map(quoteCommandPart).join(' ');
}

function quoteCommandPart(value: string): string {
  if (value === '') {
    return '""';
  }
  if (!/[\s"]/.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '\\"')}"`;
}

function formatCommandError(args: readonly string[], result: CommandResult): string {
  const output = [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join('\n');
  return output || `bzr ${args.join(' ')} failed with exit code ${result.exitCode}.`;
}
