import { describe, expect, it } from "vitest";

import { makePlayback, type PlaybackState } from "../../lib/playback";

// a hand-driven clock: frame(ms) advances time and runs the pending frame
const fakeClock = () => {
  let now = 0;
  let pending: (() => void) | undefined;
  return {
    clock: {
      now: () => now,
      requestFrame: (cb: () => void) => {
        pending = cb;
        return 1;
      },
      cancelFrame: () => {
        pending = undefined;
      },
    },
    frame: (ms: number) => {
      now += ms;
      const cb = pending;
      pending = undefined;
      cb?.();
    },
    hasFrame: () => pending !== undefined,
  };
};

describe("makePlayback", () => {
  it("advances trip time by real time × speed while playing", () => {
    const c = fakeClock();
    const p = makePlayback(c.clock);
    p.reset(100_000);
    p.play();
    c.frame(1000); // 4× default
    expect(p.get()).toMatchObject({ elapsed: 4000, isPlaying: true });
    p.setSpeed(16);
    c.frame(500);
    expect(p.get().elapsed).toBe(12_000);
  });

  it("stops at the end, and play starts over", () => {
    const c = fakeClock();
    const p = makePlayback(c.clock);
    p.reset(10_000);
    p.play();
    c.frame(5000);
    expect(p.get()).toMatchObject({ elapsed: 10_000, isPlaying: false });
    expect(c.hasFrame()).toBe(false);
    p.play();
    expect(p.get()).toMatchObject({ elapsed: 0, isPlaying: true });
  });

  it("pauses without asking for more frames", () => {
    const c = fakeClock();
    const p = makePlayback(c.clock);
    p.reset(100_000);
    p.toggle();
    c.frame(1000);
    p.toggle();
    expect(p.get()).toMatchObject({ elapsed: 4000, isPlaying: false });
    expect(c.hasFrame()).toBe(false);
  });

  it("clamps a seek to the trip", () => {
    const p = makePlayback(fakeClock().clock);
    p.reset(10_000);
    p.seek(-5);
    expect(p.get().elapsed).toBe(0);
    p.seek(99_000);
    expect(p.get().elapsed).toBe(10_000);
  });

  it("resets for a new trip, keeping the speed", () => {
    const c = fakeClock();
    const p = makePlayback(c.clock);
    p.reset(10_000);
    p.setSpeed(64);
    p.play();
    c.frame(100);
    p.reset(20_000);
    expect(p.get()).toEqual({
      elapsed: 0,
      duration: 20_000,
      isPlaying: false,
      speed: 64,
    });
    expect(c.hasFrame()).toBe(false);
  });

  it("won't play an empty trip", () => {
    const p = makePlayback(fakeClock().clock);
    p.play();
    expect(p.get().isPlaying).toBe(false);
  });

  it("tells subscribers until they leave or it is disposed", () => {
    const c = fakeClock();
    const p = makePlayback(c.clock);
    const seen: PlaybackState[] = [];
    const leave = p.subscribe((s) => seen.push(s));
    p.reset(10_000);
    p.seek(1000);
    leave();
    p.seek(2000);
    expect(seen.map((s) => s.elapsed)).toEqual([0, 1000]);

    p.subscribe((s) => seen.push(s));
    p.dispose();
    p.seek(3000);
    expect(seen).toHaveLength(2);
  });
});
