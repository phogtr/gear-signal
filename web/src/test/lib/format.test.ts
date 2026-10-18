import { describe, expect, it } from "vitest";

import type { Depot, Route } from "../../lib/api/client";
import { formatCountdown, routeLabel } from "../../lib/format";

describe("routeLabel", () => {
  const depots: Depot[] = [
    { id: 1, name: "DTLA Warehouse", lat: 34, lon: -118 },
    { id: 3, name: "Port of LA", lat: 33.7, lon: -118.2 },
  ];
  const route = (origin: number, destination: number): Route => ({
    id: 8,
    name: "dtla-port",
    originDepotId: origin,
    destinationDepotId: destination,
    distance: 0,
    duration: 0,
    coordinates: [],
  });

  it("names the origin and destination depots", () => {
    expect(routeLabel(route(1, 3), depots)).toBe("DTLA Warehouse → Port of LA");
  });

  it("shows a dash for an unknown depot", () => {
    expect(routeLabel(route(1, 9), depots)).toBe("DTLA Warehouse → —");
  });
});

describe("formatCountdown", () => {
  it("counts seconds in the last minute, rounding up", () => {
    expect(formatCountdown(59_000)).toBe("59 s");
    expect(formatCountdown(1_200)).toBe("2 s");
    // 59.4 s rounds up to 60 s, which is a minute: never shows "60 s"
    expect(formatCountdown(59_400)).toBe("1 min");
  });

  it("switches to whole minutes from one minute", () => {
    expect(formatCountdown(60_000)).toBe("1 min");
    expect(formatCountdown(89_000)).toBe("1 min");
    expect(formatCountdown(28 * 60_000)).toBe("28 min");
  });

  it("never goes negative once the ETA has passed", () => {
    expect(formatCountdown(-5_000)).toBe("0 s");
  });
});
