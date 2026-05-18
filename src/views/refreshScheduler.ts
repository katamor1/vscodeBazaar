import * as vscode from 'vscode';

export class RefreshScheduler implements vscode.Disposable {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private pending = false;
  private disposed = false;

  constructor(
    private readonly output: vscode.OutputChannel,
    private readonly refresh: (reason: string) => Promise<void> | void
  ) {}

  schedule(reason: string, delayMs: number): void {
    if (this.disposed) {
      return;
    }

    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.run(reason);
    }, delayMs);
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private async run(reason: string): Promise<void> {
    if (this.running) {
      this.pending = true;
      return;
    }

    this.running = true;
    this.pending = false;
    try {
      this.output.appendLine(`=== Bazaar 自動更新: ${reason} ===`);
      await this.refresh(reason);
    } catch (error) {
      this.output.appendLine(`Bazaar 自動更新に失敗しました: ${formatError(error)}`);
    } finally {
      this.running = false;
      if (this.pending && !this.disposed) {
        this.schedule('保留中の変更', 300);
      }
    }
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
