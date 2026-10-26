// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  describe("cancelling", () => {
    // VAN-12 has a chain of two; VAN-18 has one
    const trips = [
      trip(1, { vehicleId: 12, scheduledStart: "2026-10-21T16:00:00Z" }),
      trip(2, { vehicleId: 12, scheduledStart: "2026-10-21T17:00:00Z" }),
      trip(3, { vehicleId: 18, scheduledStart: "2026-10-21T16:30:00Z" }),
    ];
    const chainLabels = {
      ...labels,
      vehicle: (id: number) => `VAN-${id}`,
    };

    // rows keep the API's order; here trip 2 (VAN-12's last) comes before trip 3
    it("offers Cancel only on each vehicle's last trip, and says why", () => {
      render(
        <UpcomingTrips trips={trips} labels={chainLabels} onCancel={vi.fn()} />,
      );
      const buttons = screen.getAllByRole("button", { name: /^Cancel/ });
      expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
        expect.stringMatching(/^Cancel VAN-12 trip departing /),
        expect.stringMatching(/^Cancel VAN-18 trip departing /),
      ]);
      expect(
        screen.getByRole("columnheader", { name: "Action" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/latest planned trip can be cancelled/),
      ).toBeInTheDocument();
    });

    it("hands the chosen trip to onCancel", async () => {
      const onCancel = vi.fn();
      render(
        <UpcomingTrips
          trips={trips}
          labels={chainLabels}
          onCancel={onCancel}
        />,
      );
      await userEvent.click(
        screen.getByRole("button", { name: /^Cancel VAN-18/ }),
      );
      expect(onCancel).toHaveBeenCalledWith(trips[2]);
    });

    it("leaves out the note when every trip can be cancelled, and the column when read-only", () => {
      const { rerender } = render(
        <UpcomingTrips
          trips={[trips[2]]}
          labels={chainLabels}
          onCancel={vi.fn()}
        />,
      );
      expect(
        screen.queryByText(/latest planned trip can be cancelled/),
      ).not.toBeInTheDocument();

      rerender(<UpcomingTrips trips={trips} labels={chainLabels} />);
      expect(
        screen.queryByRole("columnheader", { name: "Action" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });
});
