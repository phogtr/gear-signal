// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VehicleList } from "../../../components/map/VehicleList";
import type { Depot, Route, Vehicle } from "../../../lib/api/client";
import { useSocketStore } from "../../../lib/ws/socket";
import type { VehicleState } from "../../../lib/ws/types";

const vehicle = (
  id: number,
  status: Vehicle["status"],
  depotId = 1,
): Vehicle => ({
  id,
  name: `VAN-0${id}`,
  plate: `PLATE${id}`,
  type: id === 4 ? "diesel_truck" : "ev_van",
  status,
  depotId,
});

const depots: Depot[] = [
  { id: 1, name: "DTLA Warehouse", lat: 34, lon: -118 },
  { id: 3, name: "Port of LA", lat: 33.7, lon: -118.2 },
];
const routes: Route[] = [
  {
    id: 8,
    name: "dtla-port",
    originDepotId: 1,
    destinationDepotId: 3,
    distance: 43_000,
    duration: 2400,
    coordinates: [],
  },
];
const vehicles = [
  vehicle(1, "en_route"),
  vehicle(2, "idle"),
  vehicle(3, "charging"),
  vehicle(4, "maintenance"),
];

const moving = (vehicleId: number, progress: number): VehicleState => ({
  vehicleId,
  tripId: 1,
  routeId: 8,
  distance: 43_000 * progress,
  speed: 18,
  lat: 34,
  lng: -118,
  degree: 90,
  progress,
  done: false,
});

const rowOf = (name: string) => screen.getByText(name).closest("li")!;
const renderList = (selectedId: number | null = null, onSelect = vi.fn()) =>
  render(
    <VehicleList
      vehicles={vehicles}
      depots={depots}
      routes={routes}
      selectedId={selectedId}
      onSelect={onSelect}
    />,
  );

beforeEach(() => useSocketStore.setState({ vehicles: [] }));

describe("VehicleList", () => {
  it("is a landmark named by its heading", () => {
    renderList();
    expect(
      screen.getByRole("complementary", { name: "Vehicles" }),
    ).toBeInTheDocument();
  });

  it("shows where each vehicle is: depot when parked, route and progress en route", () => {
    useSocketStore.setState({ vehicles: [moving(1, 0.42)] });
    renderList();

    const enRoute = within(rowOf("VAN-01"));
    // origin → destination, with the full text as a tooltip when it's truncated
    const where = enRoute.getByText("DTLA Warehouse → Port of LA");
    expect(where).toHaveClass("truncate", "min-w-0");
    expect(where).toHaveAttribute("title", "DTLA Warehouse → Port of LA");
    expect(enRoute.getByText("42%")).toBeInTheDocument();
    expect(enRoute.getByText("En route")).toBeInTheDocument();

    const idle = within(rowOf("VAN-02"));
    expect(idle.getByText("DTLA Warehouse")).toBeInTheDocument();
    expect(idle.getByText("Idle")).toBeInTheDocument();
    expect(
      within(rowOf("VAN-04")).getByText("Diesel truck"),
    ).toBeInTheDocument();
  });

  it("updates progress from the live feed", () => {
    useSocketStore.setState({ vehicles: [moving(1, 0.1)] });
    renderList();
    act(() => useSocketStore.setState({ vehicles: [moving(1, 0.5)] }));
    expect(within(rowOf("VAN-01")).getByText("50%")).toBeInTheDocument();
  });

  it("filters by status with pressed toggle buttons", async () => {
    const user = userEvent.setup();
    renderList();
    const filters = screen.getByRole("group", { name: "Filter by status" });

    expect(
      within(filters).getByRole("button", { name: "All 4" }),
    ).toHaveAttribute("aria-pressed", "true");

    const charging = within(filters).getByRole("button", {
      name: "Charging 1",
    });
    await user.click(charging);
    expect(charging).toHaveAttribute("aria-pressed", "true");
    const rows = within(
      screen.getByRole("list", { name: "Vehicle list" }),
    ).getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("VAN-03");
  });

  it("says so when a filter matches nothing", async () => {
    const user = userEvent.setup();
    render(
      <VehicleList
        vehicles={[vehicle(2, "idle")]}
        depots={depots}
        routes={routes}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Charging 0" }));
    expect(screen.getByText("No vehicles")).toBeInTheDocument();
  });

  it("selects a vehicle from its row, and clears it on a second press", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { rerender } = renderList(null, onSelect);

    const row = within(rowOf("VAN-02")).getByRole("button");
    expect(row).toHaveAttribute("aria-pressed", "false");
    await user.click(row);
    expect(onSelect).toHaveBeenLastCalledWith(2);

    rerender(
      <VehicleList
        vehicles={vehicles}
        depots={depots}
        routes={routes}
        selectedId={2}
        onSelect={onSelect}
      />,
    );
    expect(row).toHaveAttribute("aria-pressed", "true");
    await user.click(row);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});
