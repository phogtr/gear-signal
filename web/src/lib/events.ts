import type { EventRecord } from "./api/client";

export const EVENT_CAP = 200;

export const byNewest = (a: EventRecord, b: EventRecord): number => b.id - a.id;

// REST history + live WS, no duplicate
export const mergeEvents = (
  history: EventRecord[],
  live: EventRecord[],
): EventRecord[] => {
  const byId = new Map<number, EventRecord>();
  for (const e of history) byId.set(e.id, e);
  for (const e of live) byId.set(e.id, e);
  return [...byId.values()].sort(byNewest).slice(0, EVENT_CAP);
};

export type AlertSeverity = Exclude<EventRecord["severity"], "info">;

export interface ActiveAlert {
  code: EventRecord["code"];
  severity: AlertSeverity;
  message: string;
}

// critical first; finished trip's BATTERY_LOW alert stay
export const activeAlerts = (
  events: EventRecord[], // newest first
): Map<number, ActiveAlert[]> => {
  const seen = new Set<string>();
  const byTrip = new Map<number, ActiveAlert[]>();
  for (const e of events) {
    if (e.tripId === undefined) continue;

    const key = `${e.tripId} ${e.code}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (e.severity === "info") continue;

    const list = byTrip.get(e.tripId) ?? [];
    list.push({ code: e.code, severity: e.severity, message: e.message });
    byTrip.set(e.tripId, list);
  }
  for (const list of byTrip.values()) {
    list.sort((a, b) => rank(b.severity) - rank(a.severity));
  }
  return byTrip;
};

const rank = (s: AlertSeverity) => (s === "critical" ? 1 : 0);

export const getSeverity = (
  alerts: ActiveAlert[] | undefined,
): AlertSeverity | undefined => alerts?.[0]?.severity;
