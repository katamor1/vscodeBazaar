import * as path from 'node:path';
import type { BazaarLogOptions } from '../bazaar/client';
import { resolveHistoryFallbackSource } from '../bazaar/branchMetadata';
import type { BazaarRevision } from '../bazaar/types';

export interface BazaarLogFallbackClient {
  log(options?: BazaarLogOptions): Promise<BazaarRevision[]>;
  logAt(target: string, options?: BazaarLogOptions): Promise<BazaarRevision[]>;
}

export interface BazaarOutputLike {
  appendLine(value: string): void;
}

export async function loadBazaarRevisionsWithFallback(
  rootPath: string,
  client: BazaarLogFallbackClient,
  options: BazaarLogOptions,
  output?: BazaarOutputLike
): Promise<BazaarRevision[]> {
  const direct = await client.log(options);
  if (direct.length > 0) {
    return direct;
  }

  const fallbackSource = await resolveHistoryFallbackSource(rootPath);
  if (!fallbackSource) {
    return direct;
  }

  const fallbackTarget = options.path
    ? normalizePath(path.win32.join(fallbackSource.path, options.path))
    : fallbackSource.path;
  const fallbackOptions = withoutPath(options);
  const fallback = await client.logAt(fallbackTarget, fallbackOptions);
  if (fallback.length > 0) {
    output?.appendLine(
      `Bazaar 履歴を ${fallbackSource.name} (${fallbackSource.path}) から fallback 読み込みしました。`
    );
    return fallback;
  }

  return direct;
}

function withoutPath(options: BazaarLogOptions): BazaarLogOptions {
  const { path: _path, ...rest } = options;
  return rest;
}

function normalizePath(value: string): string {
  return path.win32.resolve(value).replace(/\\/g, '/');
}
