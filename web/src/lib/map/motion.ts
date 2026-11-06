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
  lng: number;
  lat: number;
  now: number; // ms, performance.now() when the tick arrive
  offset?: [dLng: number, dLat: number];
}

interface Track {
  state: VehicleState;
  prev: Sample;
  pen?: Sample;
}

const TICK_MS = 1000;

// interpolate vehicle between last two known distance along the route,
// plus sideways offset. Drawing one tick behind the server
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
        prev: { distance: v.distance, lng: v.lng, lat: v.lat, now },
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
      const route = routes.get(state.routeId);
      // not loaded yet
      if (!route) {
        const { vehicleId, lng, lat, degree } = state;
        return { vehicleId, lng, lat, degree };
      }

      let t = 1; // 0 = at pen, 1 = at prev
      if (isMotion && pen) {
        const interval = prev.now - pen.now || TICK_MS;
        t = Math.min(Math.max((now - prev.now) / interval, 0), 1);
      }
      const from = pen && t < 1 ? pen : prev;
      const lerp = (a: number, b: number) => a + (b - a) * t;

      const p = route.pointAt(lerp(from.distance, prev.distance));
      const [fromLng, fromLat] = offsetOf(from, route);
      const [toLng, toLat] = offsetOf(prev, route);
      return {
        vehicleId: state.vehicleId,
        lng: p.lng + lerp(fromLng, toLng),
        lat: p.lat + lerp(fromLat, toLat),
        degree: p.degree,
      };
    });

  return { update, positions, size: () => tracks.size };
};

const offsetOf = (s: Sample, route: Polyline): [number, number] => {
  if (!s.offset) {
    const on = route.pointAt(s.distance);
    // s.lng/lat include fault detour; on.lng/lat is not
    s.offset = [s.lng - on.lng, s.lat - on.lat];
  }
  return s.offset;
};
