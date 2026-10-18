import { describe, expect, it } from "vitest";

import { applyTick, backoff } from "../../../lib/ws/socket";
import type { Tick, VehicleState } from "../../../lib/ws/types";

const state = (vehicleId: number, done = false): VehicleState => ({
  vehicleId,
  tripId: vehicleId * 10,
  routeId: 1,
  distance: 100,
  speed: 18,
  lat: 34,
  lng: -118.2,
  degree: 90,
  progress: 0.1,
  done,
});

const tick = (...vehicles: VehicleState[]): Tick => ({
  type: "tick",
  ts: "2026-10-13T09:00:00Z",
  vehicles,
});

describe("applyTick", () => {
  it("is unchanged when the same vehicles keep driving", () => {
    const { vehicles, isChanged } = applyTick(
      [state(1), state(2)],
      tick(state(1), state(2)),
    );
    expect(vehicles.map((v) => v.vehicleId)).toEqual([1, 2]);
    expect(isChanged).toBe(false);
  });

  it("changes when a trip starts", () => {
    expect(applyTick([state(1)], tick(state(1), state(2))).isChanged).toBe(
      true,
    );
  });

  it("changes and drops the vehicle when a trip finishes", () => {
    const { vehicles, isChanged } = applyTick(
      [state(1), state(2)],
      tick(state(1), state(2, true)),
    );
    expect(vehicles.map((v) => v.vehicleId)).toEqual([1]);
    expect(isChanged).toBe(true);
  });

  // e.g. the done tick was missed while disconnected
  it("changes when a vehicle disappears without a done tick", () => {
    expect(applyTick([state(1), state(2)], tick(state(1))).isChanged).toBe(
      true,
    );
  });

  it("changes on the first tick after connecting", () => {
    expect(applyTick([], tick(state(1))).isChanged).toBe(true);
    expect(applyTick([], tick()).isChanged).toBe(false);
  });
});

describe("backoff", () => {
  it("doubles from 1 s and caps at 30 s", () => {
    expect([0, 1, 2, 3, 4, 5, 10].map(backoff)).toEqual([
      1000, 2000, 4000, 8000, 16_000, 30_000, 30_000,
    ]);
  });
});
