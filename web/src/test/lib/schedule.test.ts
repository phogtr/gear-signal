import { describe, expect, it } from "vitest";

import type { Depot, Route, Trip, Vehicle } from "../../lib/api/client";
import {
  byStartedAt,
  ceilToMinute,
  defaultStart,
  departureText,
  earliestStart,
  lastOfChains,
  toLocalInput,
  tripLabels,
} from "../../lib/schedule";

const trip = (id: number, fields: Partial<Trip> = {}): Trip => ({
  id,
  vehicleId: 5,
  routeId: 8,
  scheduledStart: "2026-10-21T16:00:00Z",
  status: "scheduled",
  source: "planned",
  ...fields,
});

describe("tripLabels", () => {
  const vehicles: Vehicle[] = [
    {
      id: 5,
      name: "VAN-05",
      plate: "P",
      type: "ev_van",
      status: "idle",
      depotId: 1,
    },
  ];
  const depots: Depot[] = [
    { id: 1, name: "DTLA Warehouse", lat: 34, lon: -118 },
    { id: 3, name: "Port of LA", lat: 33.7, lon: -118.2 },
  ];
  const routes: Route[] = [
    {
      id: 8,
      name: "dtla-port",
      originDepotId: 1,
      destinationDepotId: 3,
      distance: 0,
      duration: 0,
      coordinates: [],
    },
  ];
  const labels = tripLabels(vehicles, depots, routes);

  it("names vehicles and routes", () => {
    expect(labels.vehicle(5)).toBe("VAN-05");
    expect(labels.route(8)).toBe("DTLA Warehouse → Port of LA");
  });

  it("falls back for unknown ids", () => {
    expect(labels.vehicle(9)).toBe("Vehicle 9");
    expect(labels.route(9)).toBe("—");
  });
});

describe("departureText", () => {
  const start = Date.parse("2026-10-21T16:00:00Z");

  it("counts down to the scheduled start", () => {
    expect(departureText(trip(1), start - 4 * 60_000)).toBe("in 4 min");
    expect(departureText(trip(1), start - 30_000)).toBe("in 30 s");
  });

  it("says the trip is waiting once it is due (late start)", () => {
    expect(departureText(trip(1), start)).toBe("due, waiting for vehicle");
    expect(departureText(trip(1), start + 60_000)).toBe(
      "due, waiting for vehicle",
    );
  });
});

describe("byStartedAt", () => {
  it("compares times, not strings: Go drops trailing zeros", () => {
    const whole = trip(1, { startedAt: "2026-10-21T16:00:09Z" });
    const fraction = trip(2, { startedAt: "2026-10-21T16:00:09.89Z" });
    // as strings "…09Z" > "…09.89Z", which would put the later trip first
    expect([fraction, whole].sort(byStartedAt).map((t) => t.id)).toEqual([
      1, 2,
    ]);
  });

  it("uses the scheduled start before a trip has started, then the id", () => {
    const a = trip(3, { scheduledStart: "2026-10-21T16:00:00Z" });
    const b = trip(2, { scheduledStart: "2026-10-21T16:00:00Z" });
    const c = trip(1, { scheduledStart: "2026-10-21T17:00:00Z" });
    expect([c, a, b].sort(byStartedAt).map((t) => t.id)).toEqual([2, 3, 1]);
  });
});

describe("start times for the create form", () => {
  const now = Date.parse("2026-10-22T16:04:10Z");

  it("rounds up to a whole minute, keeping exact minutes", () => {
    expect(ceilToMinute(now)).toBe(Date.parse("2026-10-22T16:05:00Z"));
    expect(ceilToMinute(Date.parse("2026-10-22T16:05:00Z"))).toBe(
      Date.parse("2026-10-22T16:05:00Z"),
    );
  });

  it("starts no earlier than availableAt, rounded up (it has sub-second precision)", () => {
    const busy = "2026-10-22T16:28:06.5Z";
    expect(earliestStart(busy, now)).toBe(Date.parse("2026-10-22T16:29:00Z"));
    expect(defaultStart(busy, now)).toBe(Date.parse("2026-10-22T16:29:00Z"));
  });

  it("is strictly after now for a free vehicle; the default adds a minute of slack", () => {
    const free = "2026-10-22T16:04:10Z"; // availableAt = now
    expect(earliestStart(free, now)).toBe(Date.parse("2026-10-22T16:05:00Z"));
    expect(defaultStart(free, now)).toBe(Date.parse("2026-10-22T16:06:00Z"));

    const onTheMinute = Date.parse("2026-10-22T16:05:00Z");
    expect(earliestStart(free, onTheMinute)).toBe(
      Date.parse("2026-10-22T16:06:00Z"),
    );
  });

  it("formats local time for datetime-local and parses back to the same instant", () => {
    const value = toLocalInput(Date.parse("2026-10-22T16:05:00Z"));
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(new Date(value).getTime()).toBe(Date.parse("2026-10-22T16:05:00Z"));
  });
});

describe("lastOfChains", () => {
  it("picks each vehicle's latest scheduled trip", () => {
    const trips = [
      trip(1, { vehicleId: 12, scheduledStart: "2026-10-24T16:00:00Z" }),
      trip(2, { vehicleId: 12, scheduledStart: "2026-10-24T17:00:00Z" }),
      trip(3, { vehicleId: 18, scheduledStart: "2026-10-24T16:30:00Z" }),
      trip(4, { vehicleId: 12, scheduledStart: "2026-10-24T16:30:00.5Z" }),
    ];
    expect([...lastOfChains(trips)].sort()).toEqual([2, 3]);
  });

  it("is empty without trips", () => {
    expect(lastOfChains([]).size).toBe(0);
  });
});
