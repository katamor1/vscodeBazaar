import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { RefreshScheduler } from '../src/views/refreshScheduler';

function output(): vscode.OutputChannel {
  return { appendLine: vi.fn() } as unknown as vscode.OutputChannel;
}

describe('RefreshScheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces repeated refresh requests', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const scheduler = new RefreshScheduler(output(), refresh);

    scheduler.schedule('first', 100);
    scheduler.schedule('second', 100);
    await vi.advanceTimersByTimeAsync(100);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith('second');
  });

  it('runs one pending refresh after an in-flight refresh completes', async () => {
    vi.useFakeTimers();
    let release: () => void = () => undefined;
    const refresh = vi.fn(() => new Promise<void>((resolve) => {
      release = resolve;
    }));
    const scheduler = new RefreshScheduler(output(), refresh);

    scheduler.schedule('first', 1);
    await vi.advanceTimersByTimeAsync(1);
    scheduler.schedule('second', 1);
    await vi.advanceTimersByTimeAsync(1);
    release();
    await vi.runOnlyPendingTimersAsync();

    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
