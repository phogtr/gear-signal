import { describe, expect, it } from "vitest";

import {
  gaugeFraction,
  gaugeText,
  parseVehicleId,
  metrics,
} from "../../lib/console";
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
  metrics(s, 30_000).map((r) => `${r.label} ${r.value} ${r.unit}`);

describe("parseVehicleId", () => {
  it("accepts positive whole numbers only", () => {
    expect(parseVehicleId("12")).toBe(12);
    for (const bad of [null, "", "0", "-3", "1.5", "abc"]) {
      expect(parseVehicleId(bad)).toBeNull();
    }
  });
});

describe("metrics", () => {
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

describe("gauges", () => {
  it("marks each alert threshold on its gauge", () => {
    const gauges = (s: VehicleState) =>
      Object.fromEntries(metrics(s, 30_000).map((r) => [r.label, r.gauge]));

    const ev = gauges(state({ battery: 0.6234 }));
    expect(ev.Speed).toMatchObject({ min: 0, max: 140 });
    expect(ev.Speed?.value).toBeCloseTo(60.12);
    expect(ev.Speed?.threshold).toEqual({
      value: 105,
      when: "above",
      severity: "warning",
    });
    expect(ev.Battery?.value).toBeCloseTo(62.34);
    expect(ev.Battery?.threshold).toMatchObject({ value: 20, when: "below" });
    expect(ev.Progress).toBeUndefined();

    const diesel = gauges(state({ fuel: 0.5, engineTemp: 89.64 }));
    expect(diesel.Fuel).toEqual({ value: 50, min: 0, max: 100 });
    expect(diesel["Engine temp"]).toMatchObject({
      min: 20,
      max: 120,
      threshold: { value: 105, severity: "critical" },
    });
  });

  it("clamps a value to its scale", () => {
    expect(gaugeFraction(105, 20, 120)).toBeCloseTo(0.85);
    expect(gaugeFraction(105, 0, 140)).toBeCloseTo(0.75);
    expect(gaugeFraction(10, 20, 120)).toBe(0);
    expect(gaugeFraction(150, 0, 140)).toBe(1);
  });

  it("puts the threshold into words", () => {
    const [speed, battery] = metrics(state({ battery: 0.15 }), 30_000);
    expect(gaugeText(speed)).toBe("60 km/h, warning above 105 km/h");
    expect(gaugeText(battery)).toBe("15.0 %, warning below 20 %");
  });
});
