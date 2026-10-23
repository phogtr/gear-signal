// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UpcomingTrips } from "../../../components/schedule/UpcomingTrips";
import { labels, rowTexts, trip } from "./fixtures";

afterEach(() => vi.useRealTimers());

describe("UpcomingTrips", () => {
  it("lists trips with a live countdown to departure", () => {
    vi.useFakeTimers({ now: new Date("2026-10-21T15:59:00Z") });
    render(
      <UpcomingTrips
        trips={[trip(1), trip(2, { scheduledStart: "2026-10-21T18:00:00Z" })]}
        labels={labels}
      />,
    );

    const table = screen.getByRole("table", { name: "Upcoming" });
    expect(
      screen.getByRole("heading", { name: "Upcoming" }).nextElementSibling,
    ).toHaveTextContent("2");
    const [first, second] = rowTexts(table);
    expect(first).toContain("VAN-01");
    expect(first).toContain("DTLA Warehouse → Port of LA");
    expect(first).toContain("in 1 min");
    expect(second).toContain("in 2 h 1 min");
    // every upcoming trip is planned, so no badge
    expect(first).not.toContain("Planned");

    act(() => vi.advanceTimersByTime(30_000));
    expect(rowTexts(table)[0]).toContain("in 30 s");
  });

  it("shows a due trip as waiting for its vehicle", () => {
    vi.useFakeTimers({ now: new Date("2026-10-21T16:00:05Z") });
    render(<UpcomingTrips trips={[trip(1)]} labels={labels} />);
    expect(screen.getByText("due, waiting for vehicle")).toBeInTheDocument();
  });

  it("explains the empty state, and shows loading until data arrives", () => {
    const { rerender } = render(
      <UpcomingTrips trips={undefined} labels={labels} />,
    );
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    rerender(<UpcomingTrips trips={[]} labels={labels} />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText(/No upcoming trips/)).toBeInTheDocument();
  });
});
