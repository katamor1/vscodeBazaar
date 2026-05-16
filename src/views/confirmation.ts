import * as vscode from 'vscode';
import { confirmationMatches, confirmationPhraseFor } from '../bazaar/safety';
import type { BazaarDangerousOperation } from '../bazaar/types';

export async function confirmDangerousOperation(operation: BazaarDangerousOperation): Promise<boolean> {
  const answer = await vscode.window.showWarningMessage(
    `${operation.label}: ${operation.target}`,
    { modal: true },
    '続行'
  );
  if (answer !== '続行') {
    return false;
  }

  const requireTyped = vscode.workspace.getConfiguration('bazaar').get<boolean>(
    'dangerousOperations.requireTypedConfirmation',
    true
  );
  const phrase = confirmationPhraseFor(operation);
  if (!requireTyped) {
    return true;
  }

  const input = await vscode.window.showInputBox({
    title: operation.label,
    prompt: `正確に入力してください: ${phrase}`,
    ignoreFocusOut: true
  });
  return confirmationMatches(input, phrase, true);
}
