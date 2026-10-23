// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActiveTrips } from "../../../components/schedule/ActiveTrips";
import { useSocketStore } from "../../../lib/ws/socket";
import type { VehicleState } from "../../../lib/ws/types";
import { labels, rowTexts, trip } from "./fixtures";

const active = (
  id: number,
  startedAt: string,
  source: "demo" | "planned" = "demo",
) =>
  trip(id, {
    status: "active",
    source,
    startedAt,
    eta: "2026-10-21T16:10:00Z",
  });

const state = (tripId: number, progress: number): VehicleState => ({
  vehicleId: tripId,
  tripId,
  routeId: 8,
  distance: 0,
  speed: 15,
  lat: 34,
  lng: -118,
  degree: 0,
  progress,
  done: false,
});

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-10-21T16:05:00Z") });
  useSocketStore.setState({ vehicles: [] });
});
afterEach(() => vi.useRealTimers());

describe("ActiveTrips", () => {
  it("orders by start time, oldest first, and badges planned trips", () => {
    const trips = [
      active(3, "2026-10-21T16:02:00Z"),
      active(1, "2026-10-21T16:00:00Z", "planned"),
      active(2, "2026-10-21T16:01:00.5Z"),
    ];
    render(<ActiveTrips trips={trips} labels={labels} />);

    const rows = rowTexts(screen.getByRole("table", { name: "Active" }));
    expect(rows.map((r) => r.slice(0, 6))).toEqual([
      "VAN-01",
      "VAN-02",
      "VAN-03",
    ]);
    expect(rows[0]).toContain("Planned");
    expect(rows[1]).not.toContain("Planned");
    expect(rows[0]).toContain("in 5 min");
  });

  it("shows live progress from the socket, or a dash before the first tick", () => {
    useSocketStore.setState({ vehicles: [state(1, 0.42)] });
    render(
      <ActiveTrips
        trips={[
          active(1, "2026-10-21T16:00:00Z"),
          active(2, "2026-10-21T16:01:00Z"),
        ]}
        labels={labels}
      />,
    );
    const [first, second] = rowTexts(
      screen.getByRole("table", { name: "Active" }),
    );
    expect(first).toContain("42%");
    expect(second).toContain("—");
  });

  it("filters to planned trips, with its own empty state", () => {
    const trips = [
      active(1, "2026-10-21T16:00:00Z", "planned"),
      active(2, "2026-10-21T16:01:00Z"),
    ];
    const { rerender } = render(
      <ActiveTrips trips={trips} source="planned" labels={labels} />,
    );
    expect(
      rowTexts(screen.getByRole("table", { name: "Active" })),
    ).toHaveLength(1);
    expect(
      screen.getByRole("heading", { name: "Active" }).nextElementSibling,
    ).toHaveTextContent("1");

    rerender(
      <ActiveTrips
        trips={[active(2, "2026-10-21T16:01:00Z")]}
        source="planned"
        labels={labels}
      />,
    );
    expect(
      screen.getByText("None of the planned trips are on the road."),
    ).toBeInTheDocument();
  });
});
