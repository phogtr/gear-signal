// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TelemetryPanel } from "../../../components/console/TelemetryPanel";
import { useSocketStore } from "../../../lib/ws/socket";
import type { Trip, Vehicle } from "../../../lib/api/client";
import type { ActiveAlert } from "../../../lib/events";
import { depots, live, routes, vehicle } from "./fixtures";

// uPlot needs canvas and matchMedia, which jsdom lacks; charts are checked in the browser
vi.mock("../../../components/console/TelemetryCharts", () => ({
  TelemetryCharts: ({
    data,
    alerts,
  }: {
    data: { label: string }[];
    alerts: Map<string, string>;
  }) => (
    <p>
      charts: {data.map((m) => m.label).join(", ")}
      {alerts.size > 0 && `; alerts: ${[...alerts].join(" ")}`}
    </p>
  ),
}));

const van = vehicle(5, "VAN-05");
const truck = vehicle(7, "TRK-07", { type: "diesel_truck" });

const renderPanel = (
  v: Vehicle,
  trips: Trip[] = [],
  alerts = new Map<number, ActiveAlert[]>(),
) =>
  render(
    <TelemetryPanel
      vehicle={v}
      depots={depots}
      routes={routes}
      trips={trips}
      alerts={alerts}
    />,
  );

const value = (label: string) =>
  screen.getByText(label).closest("dt")!.nextElementSibling;

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
    expect(
      screen.getByText("charts: Speed, Fuel, Engine temp"),
    ).toBeInTheDocument();
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

  it("lists the trip's raised alerts and marks their tiles and charts", () => {
    useSocketStore.setState({
      vehicles: [live(7, { battery: undefined, fuel: 0.42, engineTemp: 107 })],
    });
    renderPanel(
      truck,
      [],
      new Map([
        [
          70,
          [
            {
              code: "OVERHEAT",
              severity: "critical",
              message: "Engine overheating at 106.2 °C",
            },
            {
              code: "ROUTE_DEVIATION",
              severity: "critical",
              message: "Off route by 201 m",
            },
            {
              code: "SPEEDING",
              severity: "warning",
              message: "Speeding at 118 km/h",
            },
          ],
        ],
      ]),
    );

    const list = screen.getByRole("list", { name: "Active alerts" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      "CriticalEngine overheating at 106.2 °C",
      "CriticalOff route by 201 m",
      "WarningSpeeding at 118 km/h",
    ]);
    expect(
      screen.getByRole("meter", { name: "Engine temp Critical" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("meter", { name: "Speed Warning" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Fuel" })).toBeInTheDocument();
    expect(
      screen.getByText(/alerts: Engine temp,critical Speed,warning$/),
    ).toBeInTheDocument();
  });

  it("ignores alerts of a finished trip", () => {
    useSocketStore.setState({
      vehicles: [],
      completed: {
        5: {
          at: "2026-10-27T16:40:00Z",
          state: live(5, { done: true, battery: 0.1 }),
        },
      },
    });
    renderPanel(
      van,
      [],
      new Map([
        [
          50,
          [
            {
              code: "BATTERY_LOW",
              severity: "warning",
              message: "Battery low at 19%",
            },
          ],
        ],
      ]),
    );

    expect(screen.getByText("Trip completed")).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Active alerts" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Battery" })).toBeInTheDocument();
  });

  it("explains when the vehicle isn't on a trip", () => {
    renderPanel(vehicle(4, "VAN-04", { status: "idle" }));
    expect(
      screen.getByText("Not on a trip right now: idle at DTLA Warehouse"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Speed")).not.toBeInTheDocument();
  });
});
