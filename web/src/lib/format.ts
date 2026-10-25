import type { Depot, Route } from "./api/client";

export const routeLabel = (route: Route, depots: Depot[]): string => {
  const name = (id: number) => depots.find((d) => d.id === id)?.name ?? "—";
  return `${name(route.originDepotId)} → ${name(route.destinationDepotId)}`;
};

const clockFormat = new Intl.DateTimeFormat([], {
  hour: "2-digit",
  minute: "2-digit",
});

const dayFormat = new Intl.DateTimeFormat([], {
  month: "short",
  day: "numeric",
});

// "16:52" in browser's time zone
export const formatClock = (time: string | number | Date): string =>
  clockFormat.format(new Date(time));

// clock alone for today, "Oct 17, 16:52" for any other day
export const formatWhen = (
  time: string | number | Date,
  now: number,
): string => {
  const d = new Date(time);
  return d.toDateString() === new Date(now).toDateString()
    ? clockFormat.format(d)
    : `${dayFormat.format(d)}, ${clockFormat.format(d)}`;
};

// seconds in last minute, whole minutes under an hour, then "1 h 20 min"
export const formatCountdown = (ms: number): string => {
  const seconds = Math.max(Math.ceil(ms / 1000), 0);
  if (seconds < 60) return `${seconds} s`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;

  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} h${rest ? ` ${rest} min` : ""}`;
};
