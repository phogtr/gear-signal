import { describe, expect, it } from "vitest";

import type { MovingVehicle } from "../../../lib/map/motion";
import { isInView, needsRedraw, overlayPadding } from "../../../lib/map/view";

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

describe("needsRedraw", () => {
  // at zoom 9.5 and LA's latitude one pixel is ~89.6 m
  const van = (fields: Partial<MovingVehicle> = {}): MovingVehicle => ({
    vehicleId: 7,
    tripId: 70,
    lng: -118.25,
    lat: 34,
    degree: 90,
    ...fields,
  });
  const north = (m: number) => van({ lat: 34 + m / 111_320 });
  const east = (m: number) =>
    van({ lng: -118.25 + m / (111_320 * Math.cos((34 * Math.PI) / 180)) });

  it("skips moves under half a pixel", () => {
    expect(needsRedraw([van()], [van()], 9.5)).toBe(false);
    expect(needsRedraw([van()], [north(40)], 9.5)).toBe(false);
    expect(needsRedraw([van()], [east(40)], 9.5)).toBe(false);
  });

  it("redraws once a vehicle moves half a pixel", () => {
    expect(needsRedraw([van()], [north(50)], 9.5)).toBe(true);
    expect(needsRedraw([van()], [east(50)], 9.5)).toBe(true);
    // zoomed in, ~2 m per pixel: every frame's move counts
    expect(needsRedraw([van()], [north(2)], 15)).toBe(true);
  });

  it("ignores a turn without a move (headings jump at polyline vertices)", () => {
    expect(needsRedraw([van()], [van({ degree: 135 })], 9.5)).toBe(false);
  });

  it("redraws when vehicles come, go or start a new trip", () => {
    const other = van({ vehicleId: 8 });
    expect(needsRedraw([van()], [van(), other], 9.5)).toBe(true);
    expect(needsRedraw([van(), other], [van()], 9.5)).toBe(true);
    expect(needsRedraw([van()], [other], 9.5)).toBe(true);
    expect(needsRedraw([van()], [van({ tripId: 71 })], 9.5)).toBe(true);
  });
});
