// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TripSummary } from "../../../components/replay/TripSummary";

import type {
  Route,
  TrackPoint,
  TripTrack,
  Vehicle,
} from "../../../lib/api/client";

const T0 = Date.parse("2026-11-13T17:00:00Z");
const at = (s: number) => new Date(T0 + s * 1000).toISOString();

const vehicle: Vehicle = {
  id: 3,
  name: "VAN-03",
  plate: "8GSV123",
  type: "ev_van",
  status: "idle",
  depotId: 1,
  res: 0.6,
};

const route: Route = {
  id: 8,
  name: "dtla-port",
  originDepotId: 1,
  destinationDepotId: 2,
  distance: 28_469.7,
  duration: 1800,
  coordinates: [
    [-118.25, 34.05],
    [-118.27, 33.74],
  ],
};

const point = (s: number): TrackPoint => ({
  ts: at(s),
  lng: -118.25,
  lat: 34.05,
  degree: 90,
  speed: 15,
});

const track = (
  seconds: number[],
  fields: Partial<TripTrack> = {},
): TripTrack => ({
  trip: {
    id: 7,
    vehicleId: 3,
    routeId: 8,
    scheduledStart: at(0),
    startedAt: at(0),
    completedAt: at(106),
    status: "completed",
    source: "planned",
  },
  points: seconds.map(point),
  events: [],
  ...fields,
});

const renderSummary = (t: TripTrack) =>
  render(
    <TripSummary
      track={t}
      vehicle={vehicle}
      route={route}
      routeText="DTLA Warehouse → Port of LA"
      now={T0}
    />,
  );

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe("TripSummary", () => {
  it("names the trip and says how long it took", () => {
    renderSummary(track(range(1, 106)));

    expect(screen.getByRole("region", { name: "VAN-03" })).toBeInTheDocument();
    expect(screen.getByText("EV van")).toBeInTheDocument();
    expect(screen.getByText("Planned")).toBeInTheDocument();
    expect(
      screen.getByText("DTLA Warehouse → Port of LA · 28.5 km"),
    ).toBeInTheDocument();
    expect(screen.getByText("1 min 46 s")).toBeInTheDocument();
    expect(screen.getByText("None")).toBeInTheDocument();
    expect(screen.getByText(/106 points/)).toHaveTextContent(
      "Recorded 106 points",
    );
  });

  it("says how much of the trip is missing", () => {
    renderSummary(track([...range(1, 20), ...range(60, 106)]));
    expect(screen.getByText(/points/)).toHaveTextContent(
      "Recorded 67 points, 1 gap with 40 s missing",
    );
  });

  it("counts raised alerts", () => {
    renderSummary(
      track(range(1, 106), {
        events: [
          {
            id: 1,
            tripId: 7,
            vehicleId: 3,
            severity: "warning",
            code: "SPEEDING",
            message: "",
            ts: at(30),
          },
          {
            id: 2,
            tripId: 7,
            vehicleId: 3,
            severity: "info",
            code: "SPEEDING",
            message: "",
            ts: at(50),
          },
        ],
      }),
    );
    expect(screen.getByText("Alerts").nextElementSibling).toHaveTextContent(
      "1",
    );
  });

  it("explains a trip with no data", () => {
    renderSummary(track([]));
    expect(screen.getByText(/No telemetry was archived/)).toBeInTheDocument();
    expect(screen.queryByText(/points/)).not.toBeInTheDocument();
  });

  it("explains a trip with only its arrival", () => {
    renderSummary(track([106]));
    expect(
      screen.getByText(/Only the arrival was recorded/),
    ).toBeInTheDocument();
  });
});
