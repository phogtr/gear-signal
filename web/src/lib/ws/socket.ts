import { create } from "zustand";

import type { Tick, VehicleState } from "./types";

export type SocketStatus = "connecting" | "live" | "offline";

interface SocketState {
  status: SocketStatus;
  vehicles: VehicleState[];
}

export const useSocketStore = create<SocketState>(() => ({
  status: "connecting",
  vehicles: [],
}));

export const connectSocket = (url: string, onTripsChanged: () => void) => {
  let ws: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let stopped = false;

  const open = () => {
    useSocketStore.setState({ status: "connecting" });
    ws = new WebSocket(url);

    ws.onopen = () => {
      attempt = 0;
      useSocketStore.setState({ status: "live" });
    };

    ws.onmessage = (e: MessageEvent<string>) => {
      const tick = JSON.parse(e.data) as Tick;
      const { vehicles, isChanged } = applyTick(
        useSocketStore.getState().vehicles,
        tick,
      );

      useSocketStore.setState({ vehicles });
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

// 1 s, 2 s, 4 s ... capped at 30 s
export const backoff = (attempt: number): number =>
  Math.min(1000 * 2 ** attempt, 30_000);
