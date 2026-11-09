import { create } from "zustand";

import { EVENT_CAP } from "../events";

import type { AlertEvent, Tick, VehicleState, VehiclesChanged } from "./types";

export type SocketStatus = "connecting" | "live" | "offline";

// vehicle's final state after it's done
export interface Completed {
  at: string;
  state: VehicleState;
}

interface SocketState {
  status: SocketStatus;
  vehicles: VehicleState[];
  completed: Record<number, Completed>;
  ts: string | null; // last tick's server time
  events: AlertEvent[]; // newest first
}

export const useSocketStore = create<SocketState>(() => ({
  status: "connecting",
  vehicles: [],
  completed: {},
  ts: null,
  events: [],
}));

interface Callbacks {
  onTripsChanged: () => void;
  onReconnect: () => void;
  onVehiclesChanged: () => void;
}

export const connectSocket = (
  url: string,
  { onTripsChanged, onReconnect, onVehiclesChanged }: Callbacks,
) => {
  let ws: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let stopped = false;
  let hasOpened = false;

  const open = () => {
    useSocketStore.setState({ status: "connecting" });
    ws = new WebSocket(url);

    ws.onopen = () => {
      attempt = 0;
      useSocketStore.setState({ status: "live" });
      if (hasOpened) onReconnect();
      hasOpened = true;
    };

    ws.onmessage = (e: MessageEvent<string>) => {
      const msg = JSON.parse(e.data) as Tick | AlertEvent | VehiclesChanged;
      if (msg.type === "vehicles") {
        onVehiclesChanged();
        return;
      }
      if (msg.type === "event") {
        useSocketStore.setState((s) => ({ events: applyEvent(s.events, msg) }));
        return;
      }

      const tick = msg;
      const prev = useSocketStore.getState();
      const { vehicles, isChanged } = applyTick(prev.vehicles, tick);
      const completed = applyCompleted(prev.completed, tick);

      useSocketStore.setState({ vehicles, completed, ts: tick.ts });
      if (isChanged) onTripsChanged();
    };

    ws.onclose = () => {
      if (stopped) return;

      useSocketStore.setState({ status: "offline" });
      retry = setTimeout(open, backoff(attempt++));
    };
  };

  open();

  return () => {
    stopped = true;
    clearTimeout(retry);
    ws?.close();
  };
};

// a tick is the full state. Compare vehicle ids with previous one tells
// whether a trip started or ended, which means `/vehicles` (parked state) is stale
export const applyTick = (
  prev: VehicleState[],
  tick: Tick,
): { vehicles: VehicleState[]; isChanged: boolean } => {
  const prevIds = new Set(prev.map((v) => v.vehicleId));
  const activeVehicles = tick.vehicles.filter((v) => !v.done);
  const isSomeHasDone = tick.vehicles.some((v) => v.done);

  const isChanged =
    isSomeHasDone ||
    activeVehicles.length !== prev.length ||
    // prev doesn't have some of current active id
    activeVehicles.some((v) => !prevIds.has(v.vehicleId));

  return { vehicles: activeVehicles, isChanged };
};

export const applyCompleted = (
  prev: Record<number, Completed>,
  tick: Tick,
): Record<number, Completed> => {
  const done = tick.vehicles.filter((v) => v.done);
  if (done.length === 0) return prev;

  const next = { ...prev };
  for (const v of done) next[v.vehicleId] = { at: tick.ts, state: v };
  return next;
};

export const applyEvent = (
  prev: AlertEvent[],
  event: AlertEvent,
): AlertEvent[] => [event, ...prev].slice(0, EVENT_CAP);

// 1s, 2s, 4s ... capped at 30s
export const backoff = (attempt: number): number =>
  Math.min(1000 * 2 ** attempt, 30_000);
