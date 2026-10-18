import type { Depot, Route } from "./api/client";

export const routeLabel = (route: Route, depots: Depot[]): string => {
  const name = (id: number) => depots.find((d) => d.id === id)?.name ?? "—";
  return `${name(route.originDepotId)} → ${name(route.destinationDepotId)}`;
};

// seconds in last minute, whole minutes before that
export const formatCountdown = (ms: number): string => {
  const seconds = Math.max(Math.ceil(ms / 1000), 0);
  return seconds < 60 ? `${seconds} s` : `${Math.round(seconds / 60)} min`;
};
