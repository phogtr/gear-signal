import { formatCountdown, routeLabel } from "./format";

import type { Depot, Route, Trip, Vehicle } from "./api/client";

export interface TripLabels {
  vehicle: (id: number) => string;
  route: (id: number) => string;
}

export const tripLabels = (
  vehicles: Vehicle[],
  depots: Depot[],
  routes: Route[],
): TripLabels => {
  const vehicleById = new Map(vehicles.map((v) => [v.id, v.name]));
  const routeById = new Map(routes.map((r) => [r.id, r]));
  return {
    vehicle: (id) => vehicleById.get(id) ?? `Vehicle ${id}`,
    route: (id) => {
      const r = routeById.get(id);
      return r ? routeLabel(r, depots) : "—";
    },
  };
};

// due trip stays scheduled until its vehicle is idle at the origin (late start)
export const departureText = (trip: Trip, now: number): string => {
  const left = new Date(trip.scheduledStart).getTime() - now;
  return left > 0 ? `in ${formatCountdown(left)}` : "due, waiting for vehicle";
};

export const byStartedAt = (a: Trip, b: Trip): number =>
  startOf(a) - startOf(b) || a.id - b.id;

const startOf = (t: Trip) =>
  new Date(t.startedAt ?? t.scheduledStart).getTime();
