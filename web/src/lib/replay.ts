import { BACKFILL_RETRY_MS } from "./backfill";

import type { TripTrack } from "./api/client";

export const GAP_MS = 1500;

export interface Gap {
  from: number; // ms
  to: number;
}

export const findGaps = (
  times: number[],
  start: number,
  end: number,
): Gap[] => {
  const gaps: Gap[] = [];
  let prev = start;
  for (const t of [...times, end]) {
    if (t - prev > GAP_MS) gaps.push({ from: prev, to: t });
    prev = Math.max(prev, t);
  }
  return gaps;
};

export type TrackState = "empty" | "arrival-only" | "ready";

export interface TrackSummary {
  state: TrackState;
  start: number;
  end: number;
  gaps: Gap[];
  missing: number; // ms
  alerts: number;
}

export const summarizeTrack = ({
  trip,
  points,
  events,
}: TripTrack): TrackSummary => {
  const times = points.map((p) => Date.parse(p.ts));
  const start = Date.parse(trip.startedAt ?? trip.scheduledStart);
  const end = trip.completedAt
    ? Date.parse(trip.completedAt)
    : (times.at(-1) ?? start);
  const gaps = points.length > 1 ? findGaps(times, start, end) : [];

  return {
    state:
      points.length === 0
        ? "empty"
        : points.length === 1
          ? "arrival-only"
          : "ready",
    start,
    end,
    gaps,
    missing: gaps.reduce((sum, g) => sum + g.to - g.from, 0),
    alerts: events.filter((e) => e.severity !== "info").length,
  };
};

export const isJustFinished = (
  track: TripTrack | null | undefined,
  now: number,
): boolean => {
  if (!track) return false;
  const { status, completedAt } = track.trip;
  if (status === "active") return true;
  return (
    status === "completed" &&
    completedAt !== undefined &&
    now - Date.parse(completedAt) < BACKFILL_RETRY_MS
  );
};
