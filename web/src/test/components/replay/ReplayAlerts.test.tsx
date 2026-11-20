// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ReplayAlerts } from "../../../components/replay/ReplayAlerts";
import { makePlayback } from "../../../lib/playback";

import type { ReplayAlert } from "../../../lib/replay";

const alerts: ReplayAlert[] = [
  {
    id: 1,
    at: 32_000,
    severity: "warning",
    code: "SPEEDING",
    message: "Speeding at 118 km/h",
  },
  {
    id: 2,
    at: 51_000,
    severity: "info",
    code: "SPEEDING",
    message: "Speed back to 98 km/h",
  },
];

const setup = (list = alerts) => {
  const playback = makePlayback({
    now: () => 0,
    requestFrame: () => 1,
    cancelFrame: () => {},
  });
  playback.reset(100_000);
  render(<ReplayAlerts playback={playback} alerts={list} />);
  return playback;
};

describe("ReplayAlerts", () => {
  it("lists each event with its time, severity and message", () => {
    setup();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("0:32 Warning Speeding at 118 km/h");
    expect(items[1]).toHaveTextContent("0:51 Cleared Speed back to 98 km/h");
  });

  it("names each button in reading order", () => {
    setup();
    expect(
      screen.getByRole("button", { name: "0:32 Warning Speeding at 118 km/h" }),
    ).toBeInTheDocument();
  });

  it("seeks to an event", async () => {
    const playback = setup();
    await userEvent.click(
      screen.getByRole("button", { name: /Speed back to 98 km\/h/ }),
    );
    expect(playback.get().elapsed).toBe(51_000);
  });

  it("renders nothing without events", () => {
    setup([]);
    expect(
      screen.queryByRole("region", { name: "Trip alerts" }),
    ).not.toBeInTheDocument();
  });
});
