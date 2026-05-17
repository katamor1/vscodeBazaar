import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutputChannel } from 'vscode';
import type { BazaarClient } from '../src/bazaar/client';
import type { BazaarGeneratedDocumentProvider } from '../src/scm/generatedDocumentProvider';
import type { BazaarOriginalDocumentProvider } from '../src/scm/originalDocumentProvider';

const vscodeMock = vi.hoisted(() => {
  const createResourceGroup = vi.fn(() => ({ resourceStates: [], dispose: vi.fn() }));
  return {
    showInputBox: vi.fn(),
    showWarningMessage: vi.fn(),
    showTextDocument: vi.fn(),
    withProgress: vi.fn((_options, task) => task()),
    registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
    createResourceGroup,
    createSourceControl: vi.fn(() => ({
      inputBox: { value: '', placeholder: '' },
      createResourceGroup,
      dispose: vi.fn()
    }))
  };
});

vi.mock('vscode', () => ({
  scm: { createSourceControl: vscodeMock.createSourceControl },
  window: {
    showInputBox: vscodeMock.showInputBox,
    showWarningMessage: vscodeMock.showWarningMessage,
    showTextDocument: vscodeMock.showTextDocument,
    withProgress: vscodeMock.withProgress,
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn()
  },
  workspace: {
    getConfiguration: () => ({
      get: (_key: string, fallback: unknown) => fallback
    })
  },
  ProgressLocation: { SourceControl: 1 },
  commands: {
    registerCommand: vscodeMock.registerCommand,
    executeCommand: vi.fn()
  },
  Uri: {
    file: (fsPath: string) => ({ scheme: 'file', fsPath, path: fsPath }),
    from: (value: Record<string, unknown>) => value
  },
  ThemeIcon: class {
    constructor(readonly id: string) {}
  }
}));

import { BazaarScmProvider } from '../src/scm/bazaarScmProvider';

describe('BazaarScmProvider uncommit preview flow', () => {
  let uncommitDryRun: ReturnType<typeof vi.fn>;
  let uncommitRun: ReturnType<typeof vi.fn>;
  let provider: BazaarScmProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    uncommitDryRun = vi.fn().mockResolvedValue('dry-run output');
    uncommitRun = vi.fn().mockResolvedValue(undefined);
    provider = new BazaarScmProvider(
      'C:/repo',
      {
        uncommitDryRun,
        uncommitRun,
        status: vi.fn().mockResolvedValue([]),
        conflicts: vi.fn().mockResolvedValue([])
      } as unknown as BazaarClient,
      {} as BazaarOriginalDocumentProvider,
      {
        openDocument: vi.fn().mockResolvedValue({ uri: { scheme: 'bazaar-generated' } })
      } as unknown as BazaarGeneratedDocumentProvider,
      { appendLine: vi.fn(), show: vi.fn() } as unknown as OutputChannel
    );
  });

  it('stops runUncommit when the required preview input is cancelled', async () => {
    vscodeMock.showInputBox.mockResolvedValue(undefined);

    await provider.runUncommit();

    expect(uncommitDryRun).not.toHaveBeenCalled();
    expect(vscodeMock.showWarningMessage).not.toHaveBeenCalled();
    expect(uncommitRun).not.toHaveBeenCalled();
  });

  it('treats an empty preview input as an explicit preview of the last revision', async () => {
    vscodeMock.showInputBox
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('Bazaar リビジョンを uncommit: 最後のリビジョン');
    vscodeMock.showWarningMessage.mockResolvedValue('続行');

    await provider.runUncommit();

    expect(uncommitDryRun).toHaveBeenCalledWith(undefined);
    expect(vscodeMock.showWarningMessage).toHaveBeenCalledWith(
      'Bazaar リビジョンを uncommit: 最後のリビジョン',
      { modal: true },
      '続行'
    );
    expect(uncommitRun).toHaveBeenCalledWith(undefined);
  });
});
