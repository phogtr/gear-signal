// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { TripPicker } from "../../../components/replay/TripPicker";
import { labels, trip } from "../schedule/fixtures";

const now = Date.parse("2026-10-21T17:00:00Z");

describe("TripPicker", () => {
  it("links each trip and marks the selected one", () => {
    const trips = [
      trip(2, {
        status: "completed",
        source: "demo",
        completedAt: "2026-10-21T16:30:00Z",
      }),
      trip(1, { status: "completed", completedAt: "2026-10-21T16:20:00Z" }),
    ];
    render(
      <TripPicker trips={trips} labels={labels} selectedId={1} now={now} />,
      { wrapper: MemoryRouter },
    );

    expect(
      screen.getByRole("navigation", { name: "Completed trips 2" }),
    ).toBeInTheDocument();
    const [first, second] = screen.getAllByRole("link");
    expect(first).toHaveAttribute("href", "/?trip=2");
    expect(first).not.toHaveAttribute("aria-current");
    expect(first).toHaveTextContent("VAN-02");
    expect(first).toHaveTextContent("DTLA Warehouse → Port of LA");
    expect(first).not.toHaveTextContent("Planned");
    expect(second).toHaveAttribute("aria-current", "true");
    expect(second).toHaveTextContent("Planned");
    expect(second.querySelector("time")).toHaveAttribute(
      "datetime",
      "2026-10-21T16:20:00Z",
    );
  });

  it("has loading and empty states", () => {
    const { rerender } = render(
      <TripPicker
        trips={undefined}
        labels={labels}
        selectedId={null}
        now={now}
      />,
      {
        wrapper: MemoryRouter,
      },
    );
    expect(screen.getByText("Loading trips")).toBeInTheDocument();
    rerender(
      <TripPicker trips={[]} labels={labels} selectedId={null} now={now} />,
    );
    expect(screen.getByText("No finished trips yet")).toBeInTheDocument();
  });

  it("lists the newest arrival first", () => {
    const trips = [
      trip(1, {
        status: "completed",
        scheduledStart: "2026-10-21T16:10:00Z",
        completedAt: "2026-10-21T16:20:00Z",
      }),
      trip(2, {
        status: "completed",
        scheduledStart: "2026-10-21T16:05:00Z",
        completedAt: "2026-10-21T16:30:00Z",
      }),
    ];
    render(
      <TripPicker trips={trips} labels={labels} selectedId={null} now={now} />,
      { wrapper: MemoryRouter },
    );
    expect(
      screen.getAllByRole("link").map((l) => l.getAttribute("href")),
    ).toEqual(["/?trip=2", "/?trip=1"]);
  });
});
