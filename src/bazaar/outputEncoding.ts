import { TextDecoder } from 'node:util';

export function decodeBazaarOutput(buffer: Buffer, platform: NodeJS.Platform = process.platform): string {
  const encoding = platform === 'win32' ? 'shift_jis' : 'utf-8';
  const decoded = new TextDecoder(encoding).decode(buffer);
  return platform === 'win32' ? normalizePythonByteEscapes(decoded, platform) : decoded;
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
