import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EVENT_CAP } from "../../../lib/events";
import {
  applyCompleted,
  applyEvent,
  applyTick,
  backoff,
  connectSocket,
  useSocketStore,
} from "../../../lib/ws/socket";
import type { AlertEvent, Tick, VehicleState } from "../../../lib/ws/types";

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

describe("applyCompleted", () => {
  it("keeps the same object while nothing finishes", () => {
    const prev = {};
    expect(applyCompleted(prev, tick(state(1), state(2)))).toBe(prev);
  });

  it("records the final state and time of each finished trip", () => {
    const old = { 3: { at: "2026-10-13T08:00:00Z", state: state(3, true) } };
    const next = applyCompleted(old, tick(state(1), state(2, true)));

    expect(next).toEqual({
      ...old,
      2: { at: "2026-10-13T09:00:00Z", state: state(2, true) },
    });
    expect(old).not.toHaveProperty("2");
  });
});

describe("applyEvent", () => {
  const ev = (id: number): AlertEvent => ({
    type: "event",
    id,
    vehicleId: 7,
    severity: "critical",
    code: "OVERHEAT",
    message: "Engine overheating at 106.2 °C",
    ts: "2026-11-03T16:52:07Z",
  });

  it("puts the new event first and keeps at most EVENT_CAP", () => {
    expect(applyEvent([ev(1)], ev(2)).map((e) => e.id)).toEqual([2, 1]);

    const full = Array.from({ length: EVENT_CAP }, (_, i) => ev(EVENT_CAP - i));
    const next = applyEvent(full, ev(EVENT_CAP + 1));
    expect(next).toHaveLength(EVENT_CAP);
    expect(next[0].id).toBe(EVENT_CAP + 1);
    expect(next.at(-1)!.id).toBe(2);
  });
});

describe("backoff", () => {
  it("doubles from 1 s and caps at 30 s", () => {
    expect([0, 1, 2, 3, 4, 5, 10].map(backoff)).toEqual([
      1000, 2000, 4000, 8000, 16_000, 30_000, 30_000,
    ]);
  });
});

describe("connectSocket", () => {
  class FakeSocket {
    static last: FakeSocket;
    onopen: (() => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    constructor() {
      FakeSocket.last = this;
    }
    close() {}
  }

  const callbacks = () => ({
    onTripsChanged: vi.fn(),
    onReconnect: vi.fn(),
    onVehiclesChanged: vi.fn(),
  });

  beforeEach(() => {
    vi.stubGlobal("WebSocket", FakeSocket);
    useSocketStore.setState({ vehicles: [], completed: {}, events: [] });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reloads vehicles on a vehicles message without touching the tick state", () => {
    const cb = callbacks();
    const stop = connectSocket("ws://test", cb);
    FakeSocket.last.onopen?.();
    FakeSocket.last.onmessage?.({ data: JSON.stringify(tick(state(1))) });
    const before = useSocketStore.getState().vehicles;

    FakeSocket.last.onmessage?.({ data: '{"type":"vehicles"}' });

    expect(cb.onVehiclesChanged).toHaveBeenCalledTimes(1);
    expect(useSocketStore.getState().vehicles).toBe(before);
    expect(cb.onTripsChanged).toHaveBeenCalledTimes(1); // the first tick only
    stop();
  });
});
