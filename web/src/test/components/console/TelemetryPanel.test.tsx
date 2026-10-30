// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { TelemetryPanel } from "../../../components/console/TelemetryPanel";
import { useSocketStore } from "../../../lib/ws/socket";
import type { Trip, Vehicle } from "../../../lib/api/client";
import { depots, live, routes, vehicle } from "./fixtures";

const van = vehicle(5, "VAN-05");
const truck = vehicle(7, "TRK-07", { type: "diesel_truck" });

const renderPanel = (v: Vehicle, trips: Trip[] = []) =>
  render(
    <TelemetryPanel
      vehicle={v}
      depots={depots}
      routes={routes}
      trips={trips}
    />,
  );

const value = (label: string) => screen.getByText(label).nextElementSibling;

beforeEach(() =>
  useSocketStore.setState({ status: "live", vehicles: [], completed: {} }),
);

describe("TelemetryPanel", () => {
  it("shows an EV's live metrics and ETA", () => {
    useSocketStore.setState({ vehicles: [live(5)] });
    const eta = new Date(Date.now() + 3 * 60_000 - 1000).toISOString();
    renderPanel(van, [
      {
        id: 50,
        vehicleId: 5,
        routeId: 8,
        scheduledStart: "2026-10-27T16:00:00Z",
        status: "active",
        source: "planned",
        eta,
      },
    ]);

    expect(screen.getByRole("region", { name: "VAN-05" })).toHaveTextContent(
      /LivePlanned|PlannedLive/,
    );
    expect(screen.getByText("DTLA Warehouse → Port of LA")).toBeInTheDocument();
    expect(value("Speed")).toHaveTextContent("72km/h");
    expect(value("Battery")).toHaveTextContent("70.0%");
    expect(value("Remaining")).toHaveTextContent("30.0km");
    expect(value("ETA")).toHaveTextContent("in 3 min");
    expect(screen.queryByText("Fuel")).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("meter").map((m) => m.getAttribute("aria-valuetext")),
    ).toEqual([
      "72 km/h, warning above 105 km/h",
      "70.0 %, warning below 20 %",
    ]);
  });

  it("shows a diesel's fuel and engine temperature", () => {
    useSocketStore.setState({
      vehicles: [live(7, { battery: undefined, fuel: 0.42, engineTemp: 90.3 })],
    });
    renderPanel(truck);

    expect(value("Fuel")).toHaveTextContent("42.0%");
    expect(screen.getByRole("meter", { name: "Engine temp" })).toHaveAttribute(
      "aria-valuetext",
      "90.3 °C, critical above 105 °C",
    );
    expect(screen.getByRole("meter", { name: "Fuel" })).toHaveAttribute(
      "aria-valuenow",
      "42",
    );
    expect(value("Engine temp")).toHaveTextContent("90.3°C");
    expect(screen.queryByText("Battery")).not.toBeInTheDocument();
  });

  it("keeps the final values once the trip completes", () => {
    useSocketStore.setState({ vehicles: [live(5)] });
    renderPanel(van);

    const final = live(5, {
      done: true,
      speed: 0,
      progress: 1,
      distance: 40_000,
      battery: 0.55,
    });
    act(() =>
      useSocketStore.setState({
        vehicles: [],
        completed: { 5: { at: "2026-10-27T16:40:00Z", state: final } },
      }),
    );

    expect(screen.getByText("Trip completed")).toBeInTheDocument();
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
    expect(value("Speed")).toHaveTextContent("0km/h");
    expect(value("Battery")).toHaveTextContent("55.0%");
    expect(value("Progress")).toHaveTextContent("100%");
    expect(value("Arrived")).toBeInTheDocument();
  });

  it("explains when the vehicle isn't on a trip", () => {
    renderPanel(vehicle(4, "VAN-04", { status: "idle" }));
    expect(
      screen.getByText("Not on a trip right now: idle at DTLA Warehouse"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Speed")).not.toBeInTheDocument();
  });
});
