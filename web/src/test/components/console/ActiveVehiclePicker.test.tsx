// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";

import { ActiveVehiclePicker } from "../../../components/console/ActiveVehiclePicker";
import { useSocketStore } from "../../../lib/ws/socket";
import type { Trip } from "../../../lib/api/client";
import { depots, live, routes, vehicle } from "./fixtures";

const vehicles = [
  vehicle(1, "VAN-10"),
  vehicle(2, "VAN-2"),
  vehicle(3, "TRK-01", { type: "diesel_truck" }),
  vehicle(4, "VAN-04", { status: "idle" }),
];
const trips: Trip[] = [
  {
    id: 20,
    vehicleId: 2,
    routeId: 8,
    scheduledStart: "2026-10-27T16:00:00Z",
    status: "active",
    source: "planned",
  },
];

const renderPicker = (selectedId: number | null = null) =>
  render(
    <MemoryRouter>
      <ActiveVehiclePicker
        vehicles={vehicles}
        depots={depots}
        routes={routes}
        trips={trips}
        selectedId={selectedId}
      />
    </MemoryRouter>,
  );

beforeEach(() =>
  useSocketStore.setState({ status: "live", vehicles: [], completed: {} }),
);

describe("ActiveVehiclePicker", () => {
  it("lists vehicles on a trip by name, linking to each one", () => {
    useSocketStore.setState({
      vehicles: [live(1), live(3, { progress: 0.5 }), live(2)],
    });
    renderPicker(2);

    const nav = screen.getByRole("navigation", { name: /Active vehicles 3/ });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      expect.stringMatching(
        /^TRK-01Diesel truck50%DTLA Warehouse → Port of LA/,
      ),
      expect.stringMatching(/^VAN-2EV vanPlanned25%/),
      expect.stringMatching(/^VAN-10EV van25%/),
    ]);
    expect(links[0]).toHaveAttribute("href", "/?vehicle=3");
    expect(links[1]).toHaveAttribute("aria-current", "true");
    expect(links[2]).not.toHaveAttribute("aria-current");
  });

  it("says why the list is empty", () => {
    renderPicker();
    expect(screen.getByText("No vehicles on the road")).toBeInTheDocument();

    act(() => useSocketStore.setState({ status: "connecting" }));
    expect(screen.getByText("Waiting for live data")).toBeInTheDocument();
  });
});
