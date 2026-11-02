import { describe, expect, it } from "vitest";

import { makeHistory } from "../../lib/history";

const columns = (h: ReturnType<typeof makeHistory>) =>
  h.data().map((c) => [...c]);

describe("makeHistory", () => {
  it("returns columns oldest first", () => {
    const h = makeHistory(4, 2);
    h.push(10, [1, 100]);
    h.push(11, [2, 101]);
    expect(columns(h)).toEqual([
      [10, 11],
      [1, 2],
      [100, 101],
    ]);
  });

  it("overwrites the oldest rows once full", () => {
    const h = makeHistory(3, 1);
    for (let t = 1; t <= 5; t++) h.push(t, [t * 10]);
    expect(columns(h)).toEqual([
      [3, 4, 5],
      [30, 40, 50],
    ]);
  });

  it("ignores a tick that isn't newer, like the one replayed on reconnect", () => {
    const h = makeHistory(3, 1);
    expect(h.push(5, [1])).toBe(true);
    expect(h.push(5, [2])).toBe(false);
    expect(h.push(4, [3])).toBe(false);
    expect(columns(h)).toEqual([[5], [1]]);
  });

  it("starts over after clear", () => {
    const h = makeHistory(3, 1);
    h.push(1, [1]);
    h.push(2, [2]);
    h.clear();
    h.push(1, [9]);
    expect(columns(h)).toEqual([[1], [9]]);
  });
});
