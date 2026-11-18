import type { Depot, Route } from "./api/client";

/** origin → destination  */
export const routeLabel = (route: Route, depots: Depot[]): string => {
  const name = (id: number) => depots.find((d) => d.id === id)?.name ?? "-";
  return `${name(route.originDepotId)} → ${name(route.destinationDepotId)}`;
};

const clockFormat = new Intl.DateTimeFormat([], {
  hour: "2-digit",
  minute: "2-digit",
});

const timeFormat = new Intl.DateTimeFormat([], {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const dayFormat = new Intl.DateTimeFormat([], {
  month: "short",
  day: "numeric",
});

/** "16:52" in browser's time zone */
export const formatClock = (time: string | number | Date): string =>
  clockFormat.format(new Date(time));

/** "16:52:07", for event log timestamps */
export const formatTime = (time: string | number | Date): string =>
  timeFormat.format(new Date(time));

/** clock alone for today, "Oct 17, 16:52" for other day */
export const formatWhen = (
  time: string | number | Date,
  now: number,
): string => {
  const d = new Date(time);
  return d.toDateString() === new Date(now).toDateString()
    ? clockFormat.format(d)
    : `${dayFormat.format(d)}, ${clockFormat.format(d)}`;
};

/**
 * seconds in last minute, whole minutes under an hour, then "1 h 20 min".
 * "1 min 46s" -> rounded to "2 min"
 * */
export const formatCountdown = (ms: number): string => {
  const seconds = Math.max(Math.ceil(ms / 1000), 0);
  if (seconds < 60) return `${seconds} s`;

  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} min`;

  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} h${rest ? ` ${rest} min` : ""}`;
};

/** "46 s", "1 min 46 s", "1 h 20 min" */
export const formatDuration = (ms: number): string => {
  const seconds = Math.max(Math.round(ms / 1000), 0);
  if (seconds < 60) return `${seconds} s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)
    return `${minutes} min${seconds % 60 ? ` ${seconds % 60} s` : ""}`;

  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} h${rest ? ` ${rest} min` : ""}`;
};

/** "0:42", "12:05", "1:02:03" */
export const formatPlayTime = (ms: number): string => {
  const total = Math.max(Math.round(ms / 1000), 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
};
