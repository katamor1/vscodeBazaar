import type { BazaarDangerousOperation } from './types';

export function confirmationPhraseFor(operation: BazaarDangerousOperation): string {
  return `${operation.label}: ${operation.target}`;
}

export function confirmationMatches(input: string | undefined, expectedPhrase: string, requireTypedConfirmation: boolean): boolean {
  if (!requireTypedConfirmation) {
    return true;
  }
  return input === expectedPhrase;
}
