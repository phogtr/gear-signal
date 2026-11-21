// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReplayMetrics } from "../../../components/replay/ReplayMetrics";
import { makePlayback } from "../../../lib/playback";
import { makeTrack, type ReplayAlert } from "../../../lib/replay";

import type { TrackPoint } from "../../../lib/api/client";

const T0 = Date.parse("2026-11-16T17:00:00Z");
const point = (s: number, kmh: number): TrackPoint => ({
  ts: new Date(T0 + s * 1000).toISOString(),
  lng: -118.25,
  lat: 34.05,
  degree: 90,
  speed: kmh / 3.6,
  battery: 0.8,
  distance: s * 100,
});

// recorded at 1, 2, 3 s, then a hole until 30 s
const points = [point(1, 50), point(2, 60), point(3, 70), point(30, 80)];

// speeding raised on the 2 s record, cleared on the 30 s one; deviation has no tile
const alerts: ReplayAlert[] = [
  { id: 1, at: 2_000, severity: "warning", code: "SPEEDING", message: "" },
  {
    id: 2,
    at: 3_000,
    severity: "critical",
    code: "ROUTE_DEVIATION",
    message: "",
  },
  { id: 3, at: 30_000, severity: "info", code: "SPEEDING", message: "" },
];

const setup = () => {
  const playback = makePlayback({
    now: () => 0,
    requestFrame: () => 1,
    cancelFrame: () => {},
  });
  playback.reset(40_000);
  render(
    <ReplayMetrics
      playback={playback}
      track={makeTrack(points)}
      points={points}
      start={T0}
      routeDistance={4000}
      alerts={alerts}
    />,
  );
  const speed = () =>
    screen.getByRole("meter", { name: /^Speed/ }).getAttribute("aria-valuenow");
  return { playback, speed };
};

describe("ReplayMetrics", () => {
  it("shows the point at or before the cursor", () => {
    const { playback, speed } = setup();
    expect(speed()).toBe("50");
    expect(screen.queryByText(/No data/)).not.toBeInTheDocument();
    act(() => playback.seek(2_900));
    expect(speed()).toBe("60");
    expect(screen.getByRole("meter", { name: "Battery" })).toHaveAttribute(
      "aria-valuenow",
      "80",
    );
    expect(screen.getByText("Progress").closest("div")).toHaveTextContent("5");
  });

  it("keeps the last values in a gap and says so", () => {
    const { playback, speed } = setup();
    act(() => playback.seek(15_000));
    expect(speed()).toBe("70");
    expect(
      screen.getByText("No data, showing record at 0:03"),
    ).toBeInTheDocument();
    act(() => playback.seek(30_000));
    expect(speed()).toBe("80");
    expect(screen.queryByText(/No data/)).not.toBeInTheDocument();
  });

  it("jumps instead of gliding, so it stays on the cursor", () => {
    setup();
    const fill = document.querySelector(".origin-left");
    expect(fill?.className).not.toContain("transition");
  });

  it("marks a tile while its alert is raised at the record shown", () => {
    const { playback } = setup();
    const speedMeter = () => screen.getByRole("meter", { name: /^Speed/ });
    expect(speedMeter()).toHaveAccessibleName("Speed");
    act(() => playback.seek(1_900));
    expect(speedMeter()).toHaveAccessibleName("Speed");
    act(() => playback.seek(2_000));
    expect(speedMeter()).toHaveAccessibleName("Speed Warning");
    // in the gap the 3 s record is shown, still speeding
    act(() => playback.seek(15_000));
    expect(speedMeter()).toHaveAccessibleName("Speed Warning");
    act(() => playback.seek(30_000));
    expect(speedMeter()).toHaveAccessibleName("Speed");
    expect(
      screen.getByRole("meter", { name: /^Battery/ }),
    ).toHaveAccessibleName("Battery");
  });
});
