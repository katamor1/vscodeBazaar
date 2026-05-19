import { TextDecoder } from 'node:util';

export interface RepositoryDecodeOptions {
  preferredEncoding?: string;
  platform?: NodeJS.Platform;
}

export function decodeBazaarOutput(buffer: Buffer, platform: NodeJS.Platform = process.platform): string {
  const encoding = platform === 'win32' ? 'shift_jis' : 'utf-8';
  const decoded = new TextDecoder(encoding).decode(buffer);
  return platform === 'win32' ? normalizePythonByteEscapes(decoded, platform) : decoded;
}

export function decodeRepositoryFileContent(buffer: Buffer, options: RepositoryDecodeOptions = {}): string {
  return tryDecodeRepositoryUnicode(buffer, options) ??
    decodeWithEncoding(buffer, 'shift_jis', false);
}

export function decodeBazaarPatchOutput(buffer: Buffer, options: RepositoryDecodeOptions = {}): string {
  return tryDecodeRepositoryUnicode(buffer, options) ??
    decodeBazaarOutput(buffer, options.platform ?? process.platform);
}

function tryDecodeRepositoryUnicode(buffer: Buffer, options: RepositoryDecodeOptions): string | undefined {
  const preferred = normalizeEncodingName(options.preferredEncoding);
  if (preferred) {
    const decoded = tryDecode(buffer, preferred);
    if (decoded !== undefined) {
      return stripUtf8Bom(decoded);
    }
  }

  if (hasUtf8Bom(buffer)) {
    return stripUtf8Bom(decodeWithEncoding(buffer, 'utf-8', true));
  }

  return tryDecode(buffer, 'utf-8') ?? tryDecode(buffer, 'euc-jp');
}

function tryDecode(buffer: Buffer, encoding: string): string | undefined {
  try {
    return decodeWithEncoding(buffer, encoding, true);
  } catch {
    return undefined;
  }
}

function decodeWithEncoding(buffer: Buffer, encoding: string, fatal: boolean): string {
  return new TextDecoder(encoding, { fatal }).decode(buffer);
}

function hasUtf8Bom(buffer: Buffer): boolean {
  return buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
}

function stripUtf8Bom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function normalizeEncodingName(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.toLowerCase().replace(/[-_\s]/g, '');
  if (normalized === 'utf8' || normalized === 'utf8bom') {
    return 'utf-8';
  }
  if (normalized === 'eucjp') {
    return 'euc-jp';
  }
  if (['shiftjis', 'sjis', 'cp932', 'windows31j', 'mskanji'].includes(normalized)) {
    return 'shift_jis';
  }
  return undefined;
}

function normalizePythonByteEscapes(text: string, platform: NodeJS.Platform): string {
  return text.replace(/'((?:\\x[0-9a-fA-F]{2}|[\x20-\x7e])*)'/g, (match, content: string) => {
    if (!content.includes('\\x')) {
      return match;
    }

    return `'${decodeEscapedBytes(content, platform)}'`;
  });
}

function decodeEscapedBytes(content: string, platform: NodeJS.Platform): string {
  const bytes: number[] = [];

  for (let index = 0; index < content.length; index++) {
    if (
      content[index] === '\\' &&
      content[index + 1] === 'x' &&
      isHexByte(content.slice(index + 2, index + 4))
    ) {
      bytes.push(Number.parseInt(content.slice(index + 2, index + 4), 16));
      index += 3;
      continue;
    }

    bytes.push(content.charCodeAt(index) & 0xff);
  }

  const encoding = platform === 'win32' ? 'shift_jis' : 'utf-8';
  return new TextDecoder(encoding).decode(Buffer.from(bytes));
}

function isHexByte(value: string): boolean {
  return /^[0-9a-fA-F]{2}$/.test(value);
}
