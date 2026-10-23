// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RecentTrips } from "../../../components/schedule/RecentTrips";
import { formatClock } from "../../../lib/format";
import { labels, rowTexts, trip } from "./fixtures";

afterEach(() => vi.useRealTimers());

describe("RecentTrips", () => {
  it("says how each trip ended and when", () => {
    vi.useFakeTimers({ now: new Date("2026-10-21T17:00:00Z") });
    const trips = [
      trip(1, { status: "cancelled", scheduledStart: "2026-10-21T18:00:00Z" }),
      trip(2, {
        status: "completed",
        source: "demo",
        completedAt: "2026-10-21T16:30:00Z",
      }),
    ];
    render(<RecentTrips trips={trips} labels={labels} />);

    const [cancelled, completed] = rowTexts(
      screen.getByRole("table", { name: "Recent" }),
    );
    expect(cancelled).toContain("Cancelled");
    expect(cancelled).toContain(
      `planned ${formatClock("2026-10-21T18:00:00Z")}`,
    );
    expect(cancelled).toContain("Planned");
    expect(completed).toContain("Completed");
    expect(completed).toContain(
      `arrived ${formatClock("2026-10-21T16:30:00Z")}`,
    );
  });

  it("adds the date to a trip from another day", () => {
    vi.useFakeTimers({ now: new Date("2026-10-21T17:00:00Z") });
    render(
      <RecentTrips
        trips={[
          trip(1, { status: "completed", completedAt: "2026-10-17T19:23:00Z" }),
        ]}
        labels={labels}
      />,
    );
    const row = rowTexts(screen.getByRole("table", { name: "Recent" }))[0];
    expect(row).toMatch(
      new RegExp(`arrived .+, ${formatClock("2026-10-17T19:23:00Z")}`),
    );
  });

  it("has an empty state per filter", () => {
    const { rerender } = render(<RecentTrips trips={[]} labels={labels} />);
    expect(screen.getByText("No finished trips yet.")).toBeInTheDocument();
    rerender(<RecentTrips trips={[]} source="planned" labels={labels} />);
    expect(
      screen.getByText(/No planned trips have finished/),
    ).toBeInTheDocument();
  });
});
