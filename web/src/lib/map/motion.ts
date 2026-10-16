import type { VehicleState } from "../ws/types";
import type { Polyline } from "./polyline";

export interface MovingVehicle {
  vehicleId: number;
  lng: number;
  lat: number;
  degree: number;
}

interface Sample {
  distance: number;
  now: number; // ms, performance.now() when the tick arrived
}

interface Track {
  state: VehicleState;
  prev: Sample;
  pen?: Sample;
}

const TICK_MS = 1000;

// interpolating vehicle between its last two known distances along the route.
// Drawing one tick behind the server
export const makeMotion = () => {
  const tracks = new Map<number, Track>();

  const update = (vehicles: VehicleState[], now: number) => {
    const seen = new Set<number>();

    for (const v of vehicles) {
      seen.add(v.vehicleId);
      const old = tracks.get(v.vehicleId);
      const isSameTrip = old?.state.tripId === v.tripId;

      tracks.set(v.vehicleId, {
        state: v,
        prev: { distance: v.distance, now },
        pen: isSameTrip ? old.prev : undefined,
      });
    }
    for (const id of tracks.keys()) {
      if (!seen.has(id)) tracks.delete(id);
    }
  };

  // isMotion = false = reduced motion, jumps straight to position
  const positions = (
    now: number,
    routes: Map<number, Polyline>,
    isMotion = true,
  ): MovingVehicle[] =>
    [...tracks.values()].map(({ state, prev, pen }) => {
      let distance = prev.distance;
      if (isMotion && pen) {
        const interval = prev.now - pen.now || TICK_MS;
        const t = Math.min(Math.max((now - prev.now) / interval, 0), 1);
        distance = pen.distance + (prev.distance - pen.distance) * t; // lerp
      }

      const route = routes.get(state.routeId);
      // routes not loaded yet: fall back to server's reported position
      const p = route
        ? route.pointAt(distance)
        : { lng: state.lng, lat: state.lat, degree: state.degree };
      return { vehicleId: state.vehicleId, ...p };
    });

  return { update, positions, size: () => tracks.size };
};
