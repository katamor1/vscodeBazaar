import * as path from 'node:path';

export interface FileHistoryUriLike {
  scheme: string;
  fsPath: string;
}

export type FileHistoryTarget =
  | { relativePath: string }
  | { warning: string };

export function resolveFileHistoryTarget(
  rootPath: string,
  explicitUri: FileHistoryUriLike | undefined,
  activeUri: FileHistoryUriLike | undefined
): FileHistoryTarget {
  const targetUri = explicitUri ?? activeUri;
  if (!targetUri || targetUri.scheme !== 'file') {
    return { warning: '先に Bazaar ツリー内のファイルを開いてください。' };
  }

  const relativePath = path.relative(rootPath, targetUri.fsPath).replace(/\\/g, '/');
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return { warning: '選択されたファイルは Bazaar ツリーの外にあります。' };
  }

  return { relativePath };
}
