import { formatCountdown, routeLabel } from "./format";

import type { Depot, Route, Trip, Vehicle } from "./api/client";

export interface TripLabels {
  vehicle: (id: number) => string;
  route: (id: number) => string;
}

const MINUTE = 60_000;

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

export const ceilToMinute = (ms: number): number =>
  Math.ceil(ms / MINUTE) * MINUTE;

// ceil to a whole minute
export const earliestStart = (availableAt: string, now: number): number =>
  ceilToMinute(Math.max(Date.parse(availableAt), now + 1000));

// an extra minute, so start doesn't pass while filling the form
export const defaultStart = (availableAt: string, now: number): number =>
  ceilToMinute(Math.max(Date.parse(availableAt), now + MINUTE));

export const toLocalInput = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const pad = (n: number) => String(n).padStart(2, "0");

export const lastOfChains = (scheduled: Trip[]): Set<number> => {
  const last = new Map<number, Trip>();
  for (const t of scheduled) {
    const prev = last.get(t.vehicleId);
    if (
      !prev ||
      Date.parse(t.scheduledStart) > Date.parse(prev.scheduledStart)
    ) {
      last.set(t.vehicleId, t);
    }
  }
  return new Set([...last.values()].map((t) => t.id));
};
