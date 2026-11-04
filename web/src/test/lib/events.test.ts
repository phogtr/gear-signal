import { describe, expect, it } from "vitest";

import { EVENT_CAP, mergeEvents } from "../../lib/events";
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
