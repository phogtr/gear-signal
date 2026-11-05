import { describe, expect, it } from "vitest";

import { EVENT_CAP, activeAlerts, mergeEvents } from "../../lib/events";
import type { EventRecord } from "../../lib/api/client";

const ev = (id: number, message = `event ${id}`): EventRecord => ({
  id,
  tripId: 1,
  vehicleId: 7,
  severity: "warning",
  code: "SPEEDING",
  message,
  ts: "2026-11-03T16:52:07Z",
});

describe("mergeEvents", () => {
  it("joins history and live events newest first, without duplicates", () => {
    const merged = mergeEvents([ev(3), ev(2), ev(1)], [ev(5), ev(4), ev(3)]);
    expect(merged.map((e) => e.id)).toEqual([5, 4, 3, 2, 1]);
  });

  it("keeps only the newest EVENT_CAP", () => {
    const history = Array.from({ length: EVENT_CAP }, (_, i) => ev(i + 1));
    const merged = mergeEvents(history, [ev(EVENT_CAP + 1)]);

    expect(merged).toHaveLength(EVENT_CAP);
    expect(merged[0].id).toBe(EVENT_CAP + 1);
    expect(merged.at(-1)!.id).toBe(2);
  });
});

describe("activeAlerts", () => {
  const at = (
    id: number,
    tripId: number | undefined,
    code: EventRecord["code"],
    severity: EventRecord["severity"],
  ): EventRecord => ({ ...ev(id, `${code} ${id}`), tripId, code, severity });

  it("keeps alerts whose newest event isn't a clear, critical first", () => {
    const alerts = activeAlerts([
      at(6, 1, "ROUTE_DEVIATION", "critical"),
      at(5, 2, "SPEEDING", "info"),
      at(4, 1, "SPEEDING", "warning"),
      at(3, 2, "SPEEDING", "warning"),
      at(2, 1, "SPEEDING", "info"), // an earlier episode on trip 1
      at(1, undefined, "BATTERY_LOW", "warning"),
    ]);

    expect([...alerts.keys()]).toEqual([1]);
    expect(alerts.get(1)).toEqual([
      {
        code: "ROUTE_DEVIATION",
        severity: "critical",
        message: "ROUTE_DEVIATION 6",
      },
      { code: "SPEEDING", severity: "warning", message: "SPEEDING 4" },
    ]);
  });

  it("orders critical before warning whatever arrived first", () => {
    const alerts = activeAlerts([
      at(2, 1, "SPEEDING", "warning"),
      at(1, 1, "OVERHEAT", "critical"),
    ]);
    expect(alerts.get(1)!.map((a) => a.code)).toEqual(["OVERHEAT", "SPEEDING"]);
  });
});
