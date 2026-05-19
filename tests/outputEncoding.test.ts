import { describe, expect, it } from 'vitest';
import {
  decodeBazaarOutput,
  decodeBazaarPatchOutput,
  decodeRepositoryFileContent
} from '../src/bazaar/outputEncoding';

describe('decodeBazaarOutput', () => {
  it('decodes Windows Bazaar Shift_JIS output for Japanese paths', () => {
    const bytes = Buffer.from([
      0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea, 0x2e, 0x74, 0x78, 0x74
    ]);

    expect(decodeBazaarOutput(bytes, 'win32')).toBe('日本語.txt');
  });

  it('normalizes Python byte-escaped Windows error text', () => {
    const output = Buffer.from(
      "bzr: ERROR: (32, 'CreateFileW', '\\x83v\\x83\\x8d\\x83Z\\x83X\\x82\\xcd\\x83t\\x83@\\x83C\\x83\\x8b')",
      'ascii'
    );

    expect(decodeBazaarOutput(output, 'win32')).toContain("'プロセスはファイル'");
  });
});

describe('decodeRepositoryFileContent', () => {
  it('removes UTF-8 BOM and decodes UTF-8 repository content', () => {
    const bytes = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('日本語.txt', 'utf8')
    ]);

    expect(decodeRepositoryFileContent(bytes, { platform: 'win32' })).toBe('日本語.txt');
  });

  it('decodes EUC-JP repository content before falling back to Shift_JIS', () => {
    const bytes = Buffer.from([0xc6, 0xfc, 0xcb, 0xdc, 0xb8, 0xec, 0x2e, 0x74, 0x78, 0x74]);

    expect(decodeRepositoryFileContent(bytes, { platform: 'win32' })).toBe('日本語.txt');
  });

  it('uses VS Code preferred encoding when it is configured and valid', () => {
    const bytes = Buffer.from([0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea, 0x2e, 0x74, 0x78, 0x74]);

    expect(decodeRepositoryFileContent(bytes, {
      platform: 'linux',
      preferredEncoding: 'shiftjis'
    })).toBe('日本語.txt');
  });
});

describe('decodeBazaarPatchOutput', () => {
  it('decodes UTF-8 and EUC-JP patch output before command-output fallback', () => {
    const utf8 = Buffer.from('--- a\n+++ b\n+日本語\n', 'utf8');
    const eucJp = Buffer.from([0x2b, 0xc6, 0xfc, 0xcb, 0xdc, 0xb8, 0xec, 0x0a]);

    expect(decodeBazaarPatchOutput(utf8, { platform: 'win32' })).toContain('+日本語');
    expect(decodeBazaarPatchOutput(eucJp, { platform: 'win32' })).toBe('+日本語\n');
  });
});
