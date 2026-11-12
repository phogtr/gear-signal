import {
  BATTERY_LOW,
  ENGINE_TEMP_LIMIT,
  ENGINE_TEMP_MAX,
  ENGINE_TEMP_MIN,
  SPEED_LIMIT,
  SPEED_MAX,
} from "../constants/console";
import { formatCountdown } from "./format";

import type { Vehicle } from "./api/client";
import type { VehicleState } from "./ws/types";

export interface Threshold {
  value: number;
  when: "above" | "below";
  severity: "warning" | "critical";
}

export interface Gauge {
  value: number;
  min: number;
  max: number;
  threshold?: Threshold;
}

export interface Metric {
  label: string;
  value: string;
  unit: string;
  gauge?: Gauge;
}

// "?vehicle=12" -> 12; anything else means nothing is selected
export const parseVehicleId = (param: string | null): number | null => {
  const id = Number(param);
  return param && Number.isInteger(id) && id > 0 ? id : null;
};

export const resLabel = (type: Vehicle["type"]) =>
  type === "ev_van" ? "Battery" : "Fuel";

export const resMetric = (type: Vehicle["type"], res: number): Metric => ({
  label: resLabel(type),
  value: percent(res),
  unit: "%",
  gauge: {
    value: res * 100,
    min: 0,
    max: 100,
    ...(type === "ev_van" && { threshold: BATTERY_LOW }),
  },
});

export const resAt = (
  { res, charging }: Pick<Vehicle, "res" | "charging">,
  now: number,
): number => {
  if (!charging) return res;

  const since = Date.parse(charging.since);
  const span = Date.parse(charging.until) - since;
  if (span <= 0) return Math.max(res, charging.target);

  const t = Math.min(Math.max((now - since) / span, 0), 1);
  return res + (charging.target - res) * t;
};

// "to 90%, full in 2 min"
export const chargeText = (
  { charging }: Pick<Vehicle, "charging">,
  now: number,
): string =>
  charging
    ? `to ${Math.round(charging.target * 100)}%, full in ${formatCountdown(Date.parse(charging.until) - now)}`
    : "";

// units (m/s, 0..1 fractions, meters)
export const metrics = (s: VehicleState, routeDistance: number): Metric[] => {
  const kmh = s.speed * 3.6; // m/s -> km/h
  const rows: Metric[] = [
    {
      label: "Speed",
      value: Math.round(kmh).toString(),
      unit: "km/h",
      gauge: { value: kmh, min: 0, max: SPEED_MAX, threshold: SPEED_LIMIT },
    },
  ];
  if (s.battery !== undefined) rows.push(resMetric("ev_van", s.battery));
  if (s.fuel !== undefined) rows.push(resMetric("diesel_truck", s.fuel));
  if (s.engineTemp !== undefined) {
    rows.push({
      label: "Engine temp",
      value: s.engineTemp.toFixed(1),
      unit: "°C",
      gauge: {
        value: s.engineTemp,
        min: ENGINE_TEMP_MIN,
        max: ENGINE_TEMP_MAX,
        threshold: ENGINE_TEMP_LIMIT,
      },
    });
  }
  const remaining = Math.max(routeDistance - s.distance, 0);
  rows.push(
    {
      label: "Progress",
      value: Math.round(s.progress * 100).toString(),
      unit: "%",
    },
    { label: "Remaining", value: (remaining / 1000).toFixed(1), unit: "km" },
  );
  return rows;
};

// one decimal; at SIM_SPEED 20, battery drop ~0.14% per tick
const percent = (fraction: number) => (fraction * 100).toFixed(1);

// where value on the gauge; 0..1
export const gaugeFraction = (value: number, min: number, max: number) =>
  Math.min(Math.max((value - min) / (max - min), 0), 1);

// screen reader for the gauge, e.g. "72 km/h, warning above 105 km/h"
export const gaugeText = (r: Metric): string => {
  const t = r.gauge?.threshold;
  const value = `${r.value} ${r.unit}`;
  return t ? `${value}, ${t.severity} ${t.when} ${t.value} ${r.unit}` : value;
};

export const decimals = (value: string): number =>
  value.split(".")[1]?.length ?? 0;

// e.g. "Speed, last 60 s: 48 to 77 km/h, now 69 km/h"
export const chartSummary = (
  label: string,
  unit: string,
  digits: number,
  windowS: number,
  values: ArrayLike<number>,
): string => {
  if (values.length === 0) return `${label}: waiting for data`;

  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < values.length; i++) {
    lo = Math.min(lo, values[i]);
    hi = Math.max(hi, values[i]);
  }
  const f = (v: number) => v.toFixed(digits);
  const now = values[values.length - 1];
  return `${label}, last ${windowS} s: ${f(lo)} to ${f(hi)} ${unit}, now ${f(now)} ${unit}`;
};
