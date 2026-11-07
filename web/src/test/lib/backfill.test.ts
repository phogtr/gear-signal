import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BACKFILL_RETRY_MS, backfill } from "../../lib/backfill";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("backfill", () => {
  it("loads now and once more after the archive has caught up", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce("first")
      .mockResolvedValue("second");
    const onLoad = vi.fn();
    backfill(load, onLoad);

    await vi.advanceTimersByTimeAsync(0);
    expect(onLoad.mock.calls).toEqual([["first"]]);

    await vi.advanceTimersByTimeAsync(BACKFILL_RETRY_MS);
    expect(onLoad.mock.calls).toEqual([["first"], ["second"]]);

    await vi.advanceTimersByTimeAsync(BACKFILL_RETRY_MS * 5);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("still retries after a failed load", async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValue("ok");
    const onLoad = vi.fn();
    backfill(load, onLoad);

    await vi.advanceTimersByTimeAsync(BACKFILL_RETRY_MS);
    expect(onLoad.mock.calls).toEqual([["ok"]]);
  });

  it("stop cancels the retry and aborts the request, ignoring a late answer", async () => {
    let finish: (value: string) => void = () => {};
    const signals: AbortSignal[] = [];
    const load = vi.fn((signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<string>((resolve) => {
        finish = resolve;
      });
    });
    const onLoad = vi.fn();
    const stop = backfill(load, onLoad);

    stop();
    expect(signals[0].aborted).toBe(true);
    finish("late");
    await vi.advanceTimersByTimeAsync(BACKFILL_RETRY_MS * 2);

    expect(load).toHaveBeenCalledTimes(1);
    expect(onLoad).not.toHaveBeenCalled();
  });
});
