import { describe, expect, it } from "vitest";

import { findGaps, isJustFinished, summarizeTrack } from "../../lib/replay";

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
