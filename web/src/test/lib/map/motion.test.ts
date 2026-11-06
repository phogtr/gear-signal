import { describe, expect, it } from "vitest";

import { makeMotion } from "../../../lib/map/motion";
import { makePolyline } from "../../../lib/map/polyline";
import type { VehicleState } from "../../../lib/ws/types";

// 0.01° east along the equator ≈ 1,112 m
const route = makePolyline([
  [0, 0],
  [0.01, 0],
]);
const routes = new Map([[1, route]]);
// on Go's 6,371,000 m sphere
const METERS_PER_DEGREE = (6_371_000 * Math.PI) / 180;

// reported on the route, unless `north` meters off it (a detour)
const state = (distance: number, tripId = 1, north = 0): VehicleState => {
  const on = route.pointAt(distance);
  return {
    vehicleId: 7,
    tripId,
    routeId: 1,
    distance,
    speed: 18,
    lng: on.lng,
    lat: on.lat + north / METERS_PER_DEGREE,
    degree: 90,
    progress: 0,
    done: false,
  };
};

describe("makeMotion", () => {
  it("shows the first tick as-is until a second one arrives", () => {
    const m = makeMotion();
    m.update([state(0)], 0);
    expect(m.positions(500, routes)[0].lng).toBeCloseTo(0, 9);
  });

  it("interpolates between the last two ticks, one tick behind", () => {
    const m = makeMotion();
    m.update([state(0)], 0);
    m.update([state(route.length / 2)], 1000);

    // just after the 2nd tick it is still where the 1st put it, so nothing jumps
    expect(m.positions(1000, routes)[0].lng).toBeCloseTo(0, 9);
    // halfway to the next tick, halfway between the two reported distances
    expect(m.positions(1500, routes)[0].lng).toBeCloseTo(0.0025, 6);
    // and it stops at the latest report instead of guessing past it
    expect(m.positions(3000, routes)[0].lng).toBeCloseTo(0.005, 6);
    expect(m.positions(1500, routes)[0].degree).toBeCloseTo(90, 6);
  });

  it("jumps to each report when smoothing is off (reduced motion)", () => {
    const m = makeMotion();
    m.update([state(0)], 0);
    m.update([state(route.length / 2)], 1000);
    expect(m.positions(1000, routes, false)[0].lng).toBeCloseTo(0.005, 6);
  });

  it("does not interpolate from a previous trip", () => {
    const m = makeMotion();
    m.update([state(route.length)], 0);
    m.update([state(0, 2)], 1000);
    expect(m.positions(1500, routes)[0].lng).toBeCloseTo(0, 9);
  });

  it("forgets vehicles that are no longer in the tick", () => {
    const m = makeMotion();
    m.update([state(0)], 0);
    m.update([], 1000);
    expect(m.size()).toBe(0);
    expect(m.positions(1500, routes)).toEqual([]);
  });

  it("uses the server position when the route isn't loaded", () => {
    const m = makeMotion();
    m.update([{ ...state(100), lng: 9, lat: 9 }], 0);
    expect(m.positions(0, new Map())[0]).toMatchObject({ lng: 9, lat: 9 });
  });

  it("keeps a detoured vehicle off the route, easing the offset like the distance", () => {
    const m = makeMotion();
    m.update([state(0)], 0);
    m.update([state(route.length / 2, 1, 300)], 1000);

    const halfway = m.positions(1500, routes)[0];
    expect(halfway.lng).toBeCloseTo(0.0025, 6);
    expect(halfway.lat * METERS_PER_DEGREE).toBeCloseTo(150, 3);
    // heading still follows the route
    expect(halfway.degree).toBeCloseTo(90, 6);

    const arrived = m.positions(3000, routes)[0];
    expect(arrived.lat * METERS_PER_DEGREE).toBeCloseTo(300, 3);
    expect(
      m.positions(1500, routes, false)[0].lat * METERS_PER_DEGREE,
    ).toBeCloseTo(300, 3);
  });
});
