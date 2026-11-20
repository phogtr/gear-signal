import { BACKFILL_RETRY_MS } from "./backfill";

import { decimals, metrics, type Gauge, type Metric } from "./console";

import type { EventRecord, TrackPoint, TripTrack } from "./api/client";
import type { Polyline } from "./map/polyline";

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

export const gapAt = (gaps: Gap[], t: number): Gap | undefined =>
  gaps.find((g) => t > g.from && t < g.to);

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

export interface TrackPosition {
  lng: number;
  lat: number;
  degree: number;
  index: number;
}

export const makeTrack = (points: TrackPoint[], route?: Polyline) => {
  const times = points.map((p) => Date.parse(p.ts));

  const offsets = points.map((p): [number, number] | undefined => {
    if (!route || p.distance === undefined) return undefined;
    const on = route.pointAt(p.distance);
    return [p.lng - on.lng, p.lat - on.lat];
  });

  const pointPosition = (i: number): TrackPosition => ({
    lng: points[i].lng,
    lat: points[i].lat,
    degree: points[i].degree,
    index: i,
  });

  /**
   * upper-bound binary search;
   * last i where times[i] <= t; -1 if before the first point
   */
  const indexAt = (t: number): number => {
    if (times.length === 0 || t < times[0]) return -1;
    let lo = 0;
    let hi = times.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (times[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  const at = (t: number, isMotion = true): TrackPosition | null => {
    if (points.length === 0) return null;
    if (t < times[0]) return times[0] - t <= GAP_MS ? pointPosition(0) : null;

    const i = indexAt(t);
    const j = i + 1;

    if (t === times[i] || !isMotion) {
      return j < times.length && times[j] - times[i] > GAP_MS && t > times[i]
        ? null
        : pointPosition(i);
    }
    if (j === times.length) {
      return t - times[i] <= GAP_MS ? pointPosition(i) : null;
    }
    if (times[j] - times[i] > GAP_MS) return null;

    const f = (t - times[i]) / (times[j] - times[i]);
    const lerp = (a: number, b: number) => a + (b - a) * f;
    const a = points[i];
    const b = points[j];
    const oa = offsets[i];
    const ob = offsets[j];

    if (route && oa && ob) {
      // similarly in motion.ts
      const on = route.pointAt(lerp(a.distance!, b.distance!));
      return {
        lng: on.lng + lerp(oa[0], ob[0]),
        lat: on.lat + lerp(oa[1], ob[1]),
        degree: on.degree,
        index: i,
      };
    }
    return {
      lng: lerp(a.lng, b.lng),
      lat: lerp(a.lat, b.lat),
      degree: a.degree,
      index: i,
    };
  };

  return { times, indexAt, at };
};

export type Track = ReturnType<typeof makeTrack>;

export const pointMetrics = (
  p: TrackPoint,
  routeDistance: number,
): Metric[] => {
  const distance = p.distance ?? 0;
  const rows = metrics(
    {
      vehicleId: 0,
      tripId: 0,
      routeId: 0,
      distance,
      speed: p.speed,
      lat: p.lat,
      lng: p.lng,
      degree: p.degree,
      progress: routeDistance > 0 ? Math.min(distance / routeDistance, 1) : 0,
      done: false,
      battery: p.battery,
      fuel: p.fuel,
      engineTemp: p.engineTemp,
    },
    routeDistance,
  );
  return p.distance === undefined
    ? rows.filter((r) => r.label !== "Progress" && r.label !== "Remaining")
    : rows;
};

export interface ChartSeries {
  label: string;
  unit: string;
  digits: number;
  gauge: Gauge;
  values: (number | null)[];
}

export interface TripCharts {
  x: number[]; // seconds since departure
  series: ChartSeries[];
}

export const tripCharts = (
  points: TrackPoint[],
  start: number,
  routeDistance: number,
): TripCharts => {
  if (points.length === 0) return { x: [], series: [] };

  const specs = pointMetrics(points[0], routeDistance).filter((m) => m.gauge);
  const x: number[] = [];
  const values = specs.map((): (number | null)[] => []);
  let prev: number | undefined;

  for (const p of points) {
    const t = Date.parse(p.ts);
    if (prev !== undefined && t - prev > GAP_MS) {
      x.push(((prev + t) / 2 - start) / 1000);
      values.forEach((v) => v.push(null));
    }
    const rows = pointMetrics(p, routeDistance);
    x.push((t - start) / 1000);
    specs.forEach((spec, i) =>
      values[i].push(
        rows.find((r) => r.label === spec.label)?.gauge?.value ?? null,
      ),
    );
    prev = t;
  }

  return {
    x,
    series: specs.map((spec, i) => ({
      label: spec.label,
      unit: spec.unit,
      digits: decimals(spec.value),
      gauge: spec.gauge!,
      values: values[i],
    })),
  };
};

/** "Speed over the trip: 42 to 118 km/h" */
export const tripChartSummary = (s: ChartSeries): string => {
  const known = s.values.filter((v): v is number => v !== null);
  if (known.length === 0) return `${s.label}: no data`;
  const f = (v: number) => v.toFixed(s.digits);
  return `${s.label} over the trip: ${f(Math.min(...known))} to ${f(Math.max(...known))} ${s.unit}`;
};

const TIME_STEPS_S = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];

export const timeStep = (durationS: number): number =>
  TIME_STEPS_S.find((step) => durationS / step <= 8) ?? 3600;

export interface ReplayAlert {
  id: number;
  at: number; // ms since departure
  severity: EventRecord["severity"];
  code: EventRecord["code"];
  message: string;
}

export const tripAlerts = (
  events: EventRecord[],
  start: number,
  duration: number,
): ReplayAlert[] =>
  events.map((e) => ({
    id: e.id,
    at: Math.min(Math.max(Date.parse(e.ts) - start, 0), duration),
    severity: e.severity,
    code: e.code,
    message: e.message,
  }));
