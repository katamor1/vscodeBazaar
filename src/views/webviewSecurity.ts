import { randomBytes } from 'node:crypto';

export function createWebviewNonce(): string {
  return randomBytes(16).toString('base64url');
}

export function webviewContentSecurityPolicy(cspSource: string, nonce: string): string {
  return [
    "default-src 'none'",
    `img-src ${cspSource} https: data:`,
    `style-src ${cspSource} 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`
  ].join('; ');
}
