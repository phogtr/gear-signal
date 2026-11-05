import type { Threshold } from "../lib/console";
import type { EventRecord } from "../lib/api/client";

// server's alert thresholds (internal/alert/alert.go)
export const SPEED_LIMIT: Threshold = {
  value: 105,
  when: "above",
  severity: "warning",
};
export const ENGINE_TEMP_LIMIT: Threshold = {
  value: 105,
  when: "above",
  severity: "critical",
};
export const BATTERY_LOW: Threshold = {
  value: 20,
  when: "below",
  severity: "warning",
};

// speed peak ~115 km/h, cold engine start at ~25 °C
export const SPEED_MAX = 140;
export const ENGINE_TEMP_MIN = 0;
export const ENGINE_TEMP_MAX = 120;

export const ALERT_METRIC: Partial<Record<EventRecord["code"], string>> = {
  SPEEDING: "Speed",
  OVERHEAT: "Engine temp",
  BATTERY_LOW: "Battery",
};
