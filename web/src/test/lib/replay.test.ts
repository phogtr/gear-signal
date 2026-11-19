import { describe, expect, it } from "vitest";

import {
  findGaps,
  gapAt,
  isJustFinished,
  makeTrack,
  pointMetrics,
  summarizeTrack,
} from "../../lib/replay";
import { makePolyline } from "../../lib/map/polyline";

import type {
  EventRecord,
  TrackPoint,
  Trip,
  TripTrack,
} from "../../lib/api/client";

const T0 = Date.parse("2026-11-13T17:00:00Z");
const at = (s: number) => new Date(T0 + s * 1000).toISOString();

const point = (s: number): TrackPoint => ({
  ts: at(s),
  lng: -118.25,
  lat: 34.05,
  degree: 90,
  speed: 15,
});

const track = (
  seconds: number[],
  trip: Partial<Trip> = {},
  events: EventRecord[] = [],
): TripTrack => ({
  trip: {
    id: 7,
    vehicleId: 3,
    routeId: 8,
    scheduledStart: at(0),
    startedAt: at(0),
    completedAt: at(seconds.at(-1) ?? 10),
    status: "completed",
    source: "demo",
    ...trip,
  },
  points: seconds.map(point),
  events,
});

const event = (id: number, severity: EventRecord["severity"]): EventRecord => ({
  id,
  tripId: 7,
  vehicleId: 3,
  severity,
  code: "SPEEDING",
  message: "",
  ts: at(id),
});

describe("findGaps", () => {
  it("finds none at one point a second", () => {
    expect(findGaps([1000, 2000, 3000], 0, 3000)).toEqual([]);
  });

  it("finds a missing tick, a hole and the edges", () => {
    expect(findGaps([3000, 4000, 6000, 7000], 0, 9000)).toEqual([
      { from: 0, to: 3000 },
      { from: 4000, to: 6000 },
      { from: 7000, to: 9000 },
    ]);
  });

  it("tolerates tick jitter", () => {
    expect(findGaps([1009, 2010, 3000], 0, 3000)).toEqual([]);
  });
});

describe("summarizeTrack", () => {
  it("is ready with no gaps for a full trip", () => {
    const s = summarizeTrack(track([1, 2, 3, 4]));
    expect(s.state).toBe("ready");
    expect(s.gaps).toEqual([]);
    expect(s.end - s.start).toBe(4000);
  });

  it("adds up the missing time", () => {
    const s = summarizeTrack(track([1, 2, 10, 11, 12]));
    expect(s.gaps).toHaveLength(1);
    expect(s.missing).toBe(8000);
  });

  it("tells an empty track from an arrival-only one", () => {
    expect(summarizeTrack(track([])).state).toBe("empty");
    expect(summarizeTrack(track([40])).state).toBe("arrival-only");
    expect(summarizeTrack(track([40])).gaps).toEqual([]);
  });

  it("counts raised alerts, not clears", () => {
    const s = summarizeTrack(
      track([1, 2], {}, [
        event(1, "warning"),
        event(2, "info"),
        event(3, "critical"),
      ]),
    );
    expect(s.alerts).toBe(2);
  });
});

describe("isJustFinished", () => {
  it("waits for an active trip and a just-finished one", () => {
    const t = track([1, 2]);
    const done = Date.parse(t.trip.completedAt!);
    expect(
      isJustFinished(
        track([1], { status: "active", completedAt: undefined }),
        done,
      ),
    ).toBe(true);
    expect(isJustFinished(t, done + 5000)).toBe(true);
    expect(isJustFinished(t, done + 6000)).toBe(false);
  });

  it("never refetches a missing or cancelled trip", () => {
    expect(isJustFinished(null, T0)).toBe(false);
    expect(isJustFinished(undefined, T0)).toBe(false);
    expect(
      isJustFinished(
        track([], { status: "cancelled", completedAt: undefined }),
        T0,
      ),
    ).toBe(false);
  });
});

describe("gapAt", () => {
  const gaps = [{ from: 10_000, to: 30_000 }];
  it("finds the gap a time falls in, not its edges", () => {
    expect(gapAt(gaps, 20_000)).toBe(gaps[0]);
    expect(gapAt(gaps, 10_000)).toBeUndefined();
    expect(gapAt(gaps, 30_000)).toBeUndefined();
    expect(gapAt(gaps, 5_000)).toBeUndefined();
  });
});

describe("makeTrack", () => {
  // 0.01° east along the equator ≈ 1,112 m; turns north at the end
  const route = makePolyline([
    [0, 0],
    [0.01, 0],
    [0.01, 0.01],
  ]);
  // on the route at `distance`, or `north` degrees off it (a detour)
  const onRoute = (s: number, distance: number, north = 0): TrackPoint => {
    const on = route.pointAt(distance);
    return {
      ts: at(s),
      lng: on.lng,
      lat: on.lat + north,
      degree: on.degree,
      speed: 15,
      distance,
    };
  };
  const ms = (s: number) => T0 + s * 1000;

  it("is at a point exactly at its time", () => {
    const t = makeTrack([onRoute(0, 0), onRoute(1, 500)], route);
    expect(t.at(ms(1))).toMatchObject({
      lng: route.pointAt(500).lng,
      index: 1,
    });
  });

  it("follows the route between points, around a corner", () => {
    // 1,000 m -> 1,300 m: the corner is at ~1,112 m, so halfway (1,150 m) is past it, heading north
    const t = makeTrack([onRoute(0, 1000), onRoute(1, 1300)], route);
    const p = t.at(ms(0.5))!;
    const want = route.pointAt(1150);
    expect(p.lng).toBeCloseTo(want.lng, 9);
    expect(p.lat).toBeCloseTo(want.lat, 9);
    expect(p.degree).toBeCloseTo(0, 6);
    expect(p.index).toBe(0);
  });

  it("carries a detour offset between points", () => {
    const t = makeTrack([onRoute(0, 0, 0.001), onRoute(1, 500, 0.003)], route);
    const p = t.at(ms(0.5))!;
    expect(p.lat).toBeCloseTo(0.002, 9);
    expect(p.lng).toBeCloseTo(route.pointAt(250).lng, 9);
  });

  it("draws a straight line for points without distance", () => {
    const a = { ...point(0), lng: 0, lat: 0 };
    const b = { ...point(1), lng: 0.01, lat: 0.01 };
    const p = makeTrack([a, b], route).at(ms(0.5))!;
    expect(p).toMatchObject({ lng: 0.005, lat: 0.005 });
  });

  it("shows nothing inside a gap, but the points around it", () => {
    const t = makeTrack(
      [onRoute(0, 0), onRoute(1, 50), onRoute(30, 900)],
      route,
    );
    expect(t.at(ms(1))?.index).toBe(1);
    expect(t.at(ms(15))).toBeNull();
    expect(t.at(ms(30))?.index).toBe(2);
  });

  it("holds the first and last point for a moment, not across a gap", () => {
    const t = makeTrack([onRoute(1, 0), onRoute(2, 50)], route);
    expect(t.at(ms(0))?.index).toBe(0);
    expect(t.at(ms(3))?.index).toBe(1);
    expect(t.at(ms(-5))).toBeNull();
    expect(t.at(ms(10))).toBeNull();
  });

  it("steps from point to point with reduced motion", () => {
    const t = makeTrack([onRoute(0, 0), onRoute(1, 500)], route);
    expect(t.at(ms(0.9), false)).toMatchObject({ lng: 0, index: 0 });
  });

  it("has nothing to show without points", () => {
    expect(makeTrack([], route).at(T0)).toBeNull();
  });
});

describe("makeTrack.indexAt", () => {
  it("finds the point at or before a time, -1 before the first", () => {
    const t = makeTrack([point(1), point(2), point(30)]);
    const ms = (s: number) => T0 + s * 1000;
    expect(t.indexAt(ms(0))).toBe(-1);
    expect(t.indexAt(ms(1))).toBe(0);
    expect(t.indexAt(ms(1.9))).toBe(0);
    expect(t.indexAt(ms(15))).toBe(1);
    expect(t.indexAt(ms(99))).toBe(2);
    expect(makeTrack([]).indexAt(T0)).toBe(-1);
  });
});

describe("pointMetrics", () => {
  const values = (p: TrackPoint) =>
    Object.fromEntries(pointMetrics(p, 20_000).map((m) => [m.label, m.value]));

  it("gives a point the console's tiles", () => {
    const ev = { ...point(1), speed: 20, battery: 0.634, distance: 5000 };
    expect(values(ev)).toEqual({
      Speed: "72",
      Battery: "63.4",
      Progress: "25",
      Remaining: "15.0",
    });
    const truck = { ...point(1), fuel: 0.5, engineTemp: 91.26, distance: 0 };
    expect(values(truck)).toMatchObject({
      Fuel: "50.0",
      "Engine temp": "91.3",
    });
  });

  it("leaves out progress and remaining without a distance", () => {
    expect(Object.keys(values({ ...point(1), battery: 0.5 }))).toEqual([
      "Speed",
      "Battery",
    ]);
  });
});
