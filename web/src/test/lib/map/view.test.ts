import { describe, expect, it } from "vitest";

import { isInView, overlayPadding } from "../../../lib/map/view";

describe("isInView", () => {
  const pad = overlayPadding(false); // desktop: left 320, top 72, right 64, bottom 120
  const [w, h] = [920, 800];

  it("accepts a point in the open part of the map", () => {
    expect(isInView({ x: 600, y: 400 }, w, h, pad)).toBe(true);
  });

  it("rejects a point under the detail card or off-screen", () => {
    expect(isInView({ x: 150, y: 100 }, w, h, pad)).toBe(false); // under the card
    expect(isInView({ x: 600, y: 760 }, w, h, pad)).toBe(false); // legend row
    expect(isInView({ x: 1200, y: 400 }, w, h, pad)).toBe(false); // off to the right
  });
});

describe("overlayPadding", () => {
  it("keeps the bottom clear on phones, where the card sits", () => {
    expect(overlayPadding(true).bottom).toBeGreaterThan(
      overlayPadding(false).bottom,
    );
    expect(overlayPadding(true).left).toBeLessThan(overlayPadding(false).left);
  });
});
