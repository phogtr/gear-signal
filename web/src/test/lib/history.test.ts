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

  it("merges older rows in front of live ones", () => {
    const h = makeHistory(5, 1);
    h.push(10, [100]);
    expect(
      h.merge([
        { t: 8, values: [80] },
        { t: 9, values: [90] },
      ]),
    ).toBe(true);
    expect(columns(h)).toEqual([
      [8, 9, 10],
      [80, 90, 100],
    ]);
  });

  it("keeps the row it has when a merged row has the same time", () => {
    const h = makeHistory(5, 1);
    h.push(10, [100]);
    expect(h.merge([{ t: 10, values: [999] }])).toBe(false);
    expect(columns(h)).toEqual([[10], [100]]);
  });

  it("fills a hole between merged and live rows", () => {
    const h = makeHistory(5, 1);
    h.merge([{ t: 8, values: [80] }]);
    h.push(11, [110]);
    h.merge([
      { t: 8, values: [80] },
      { t: 9, values: [90] },
      { t: 10, values: [100] },
    ]);
    expect(columns(h)).toEqual([
      [8, 9, 10, 11],
      [80, 90, 100, 110],
    ]);
  });

  it("keeps the newest rows when a merge overflows, even after wrapping", () => {
    const h = makeHistory(3, 1);
    for (let t = 4; t <= 8; t++) h.push(t, [t]);
    expect(h.merge([{ t: 5, values: [5] }])).toBe(true);
    expect(columns(h)).toEqual([
      [6, 7, 8],
      [6, 7, 8],
    ]);
  });

  it("keeps pushing after a merge", () => {
    const h = makeHistory(3, 1);
    h.merge([
      { t: 1, values: [1] },
      { t: 2, values: [2] },
      { t: 3, values: [3] },
    ]);
    expect(h.push(3, [99])).toBe(false);
    expect(h.push(4, [4])).toBe(true);
    expect(columns(h)).toEqual([
      [2, 3, 4],
      [2, 3, 4],
    ]);
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
