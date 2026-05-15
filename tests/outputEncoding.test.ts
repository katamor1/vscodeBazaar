import { describe, expect, it } from 'vitest';
import { decodeBazaarOutput } from '../src/bazaar/outputEncoding';

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
