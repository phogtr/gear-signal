import { describe, expect, it } from "vitest";

import { parseVehicleId, readouts } from "../../lib/console";
import type { VehicleState } from "../../lib/ws/types";

const state = (extra: Partial<VehicleState>): VehicleState => ({
  vehicleId: 5,
  tripId: 50,
  routeId: 1,
  distance: 12_340,
  speed: 16.7,
  lat: 34,
  lng: -118.2,
  degree: 90,
  progress: 0.4113,
  done: false,
  ...extra,
});

const table = (s: VehicleState) =>
  readouts(s, 30_000).map((r) => `${r.label} ${r.value} ${r.unit}`);

describe("parseVehicleId", () => {
  it("accepts positive whole numbers only", () => {
    expect(parseVehicleId("12")).toBe(12);
    for (const bad of [null, "", "0", "-3", "1.5", "abc"]) {
      expect(parseVehicleId(bad)).toBeNull();
    }
  });
});

describe("readouts", () => {
  it("shows an EV's battery and no diesel values", () => {
    expect(table(state({ battery: 0.6234 }))).toEqual([
      "Speed 60 km/h",
      "Battery 62.3 %",
      "Progress 41 %",
      "Remaining 17.7 km",
    ]);
  });

  it("shows a diesel's fuel and engine temperature", () => {
    expect(table(state({ fuel: 0.5, engineTemp: 89.64 }))).toEqual([
      "Speed 60 km/h",
      "Fuel 50.0 %",
      "Engine temp 89.6 °C",
      "Progress 41 %",
      "Remaining 17.7 km",
    ]);
  });

  it("keeps an empty battery and never shows negative distance left", () => {
    expect(table(state({ battery: 0, distance: 30_100 }))).toContain(
      "Battery 0.0 %",
    );
    expect(table(state({ distance: 30_100 }))).toContain("Remaining 0.0 km");
  });
});
