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
