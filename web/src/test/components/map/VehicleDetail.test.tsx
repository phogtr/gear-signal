// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VehicleDetail } from "../../../components/map/VehicleDetail";
import type { Depot, Route, Trip, Vehicle } from "../../../lib/api/client";
import { useSocketStore } from "../../../lib/ws/socket";

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
    distance: 40_000,
    duration: 2400,
    coordinates: [],
  },
];
const van = (status: Vehicle["status"]): Vehicle => ({
  id: 5,
  name: "VAN-05",
  plate: "8ABC123",
  type: "ev_van",
  status,
  depotId: 1,
});

const row = (label: string) => screen.getByText(label).nextElementSibling;

beforeEach(() => useSocketStore.setState({ vehicles: [] }));

describe("VehicleDetail", () => {
  it("shows the depot for a parked vehicle", () => {
    render(
      <VehicleDetail
        vehicle={van("idle")}
        depots={depots}
        routes={routes}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("region", { name: "VAN-05" })).toBeInTheDocument();
    expect(row("Status")).toHaveTextContent("Idle");
    expect(row("Plate")).toHaveTextContent("8ABC123");
    expect(row("Depot")).toHaveTextContent("DTLA Warehouse");
  });

  it("shows the live trip for a vehicle en route, in display units", () => {
    vi.useFakeTimers({ now: new Date("2026-10-16T09:00:00Z") });
    useSocketStore.setState({
      vehicles: [
        {
          vehicleId: 5,
          tripId: 1,
          routeId: 8,
          distance: 10_000,
          speed: 18, // m/s
          lat: 34,
          lng: -118,
          degree: 180,
          progress: 0.25,
          done: false,
        },
      ],
    });
    const trip: Trip = {
      id: 1,
      vehicleId: 5,
      routeId: 8,
      scheduledStart: "2026-10-16T08:50:00Z",
      status: "active",
      eta: "2026-10-16T09:28:00Z",
    };

    render(
      <VehicleDetail
        vehicle={van("en_route")}
        depots={depots}
        routes={routes}
        trip={trip}
        onClose={vi.fn()}
      />,
    );
    expect(row("Route")).toHaveTextContent("DTLA Warehouse → Port of LA");
    expect(row("Progress")).toHaveTextContent("25%");
    expect(row("Speed")).toHaveTextContent("65 km/h"); // 18 × 3.6 = 64.8
    expect(row("Remaining")).toHaveTextContent("30.0 km");
    expect(row("ETA")).toHaveTextContent("(in 28 min)");
    vi.useRealTimers();
  });

  it("closes from its button and with Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <VehicleDetail
        vehicle={van("idle")}
        depots={depots}
        routes={routes}
        onClose={onClose}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Close VAN-05 details" }),
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
