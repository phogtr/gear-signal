import { describe, expect, it } from "vitest";

import { bearing, makePolyline, haversine } from "../../../lib/map/polyline";

// one degree of latitude on Go's 6,371,000 m sphere
const DEG = (2 * Math.PI * 6_371_000) / 360; // ≈ 111,194.9 m

describe("haversine", () => {
  it("matches the server's sphere: 1° of latitude ≈ 111,195 m", () => {
    expect(haversine([0, 0], [0, 1])).toBeCloseTo(DEG, 3);
  });
});

describe("bearing", () => {
  it("is a compass heading, clockwise from north", () => {
    expect(bearing([0, 0], [0, 1])).toBeCloseTo(0, 9);
    expect(bearing([0, 0], [1, 0])).toBeCloseTo(90, 9);
    expect(bearing([0, 1], [0, 0])).toBeCloseTo(180, 9);
    expect(bearing([1, 0], [0, 0])).toBeCloseTo(270, 9);
  });
});

describe("makePolyline", () => {
  // an L at the equator: 1° east, then 1° north
  const line = makePolyline([
    [0, 0],
    [1, 0],
    [1, 1],
  ]);

  it("measures the whole length", () => {
    expect(line.length).toBeCloseTo(2 * DEG, 3);
  });

  it("finds the point and heading on the first segment", () => {
    const p = line.pointAt(DEG / 2);
    expect(p.lng).toBeCloseTo(0.5, 9);
    expect(p.lat).toBeCloseTo(0, 9);
    expect(p.degree).toBeCloseTo(90, 9);
  });

  it("turns north on the second segment", () => {
    const p = line.pointAt(DEG * 1.25);
    expect(p.lng).toBeCloseTo(1, 9);
    expect(p.lat).toBeCloseTo(0.25, 9);
    expect(p.degree).toBeCloseTo(0, 9);
  });

  it("clamps to the ends", () => {
    expect(line.pointAt(-50)).toMatchObject({ lng: 0, lat: 0 });
    expect(line.pointAt(1e9)).toMatchObject({ lng: 1, lat: 1 });
  });
});
