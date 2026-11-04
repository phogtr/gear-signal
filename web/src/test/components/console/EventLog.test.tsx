// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";

import { EventLog } from "../../../components/console/EventLog";
import { useSocketStore } from "../../../lib/ws/socket";
import type { EventRecord } from "../../../lib/api/client";
import { alert, vehicle } from "./fixtures";

const vehicles = [vehicle(1, "VAN-01"), vehicle(2, "TRK-02")];

const record = (...args: Parameters<typeof alert>): EventRecord => {
  const { type: _, ...rest } = alert(...args);
  return rest;
};

const renderLog = (
  history: EventRecord[] | undefined,
  selectedId: number | null = null,
  isHistoryError = false,
) =>
  render(
    <MemoryRouter>
      <EventLog
        history={history}
        isHistoryError={isHistoryError}
        vehicles={vehicles}
        selectedId={selectedId}
      />
    </MemoryRouter>,
  );

const rows = () => within(screen.getByRole("list")).getAllByRole("listitem");

beforeEach(() => useSocketStore.setState({ events: [] }));

describe("EventLog", () => {
  it("merges history and live events, newest first, with severity in text", () => {
    useSocketStore.setState({
      events: [
        alert(3, 2, {
          severity: "critical",
          code: "OVERHEAT",
          message: "Engine overheating at 106.2 °C",
        }),
        alert(2, 1, { severity: "info", message: "Speed back to 98 km/h" }),
      ],
    });
    renderLog([record(2, 1, { severity: "info" }), record(1, 1)]);

    expect(
      screen.getByRole("heading", { name: "Events 3" }),
    ).toBeInTheDocument();
    expect(rows().map((r) => r.textContent)).toEqual([
      expect.stringMatching(/^CriticalTRK-02.*Engine overheating at 106.2 °C$/),
      expect.stringMatching(/^ClearedVAN-01.*Speed back to 98 km\/h$/),
      expect.stringMatching(/^WarningVAN-01.*Speeding at 118 km\/h$/),
    ]);
    expect(
      within(rows()[0]).getByRole("link", { name: "TRK-02" }),
    ).toHaveAttribute("href", "/?vehicle=2");
    expect(rows()[0].querySelector("time")).toHaveAttribute(
      "datetime",
      "2026-11-03T16:52:07Z",
    );
  });

  it("adds live events as they arrive", () => {
    renderLog([]);
    expect(screen.getByText("No events yet")).toBeInTheDocument();

    act(() => useSocketStore.setState({ events: [alert(1, 1)] }));
    expect(rows()).toHaveLength(1);
  });

  it("filters to the selected vehicle", async () => {
    renderLog([record(2, 2), record(1, 1)], 1);

    const group = screen.getByRole("group", { name: "Show events for" });
    const all = within(group).getByRole("button", { name: "All vehicles" });
    const one = within(group).getByRole("button", { name: "VAN-01" });
    expect(all).toHaveAttribute("aria-pressed", "true");
    expect(rows()).toHaveLength(2);

    await userEvent.click(one);
    expect(one).toHaveAttribute("aria-pressed", "true");
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent("VAN-01");
  });

  it("has no filter without a selected vehicle", () => {
    renderLog([record(1, 1)]);
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("says why the log is empty", () => {
    const { unmount } = renderLog(undefined);
    expect(screen.getByText("Loading events")).toBeInTheDocument();
    unmount();

    renderLog(undefined, null, true);
    expect(
      screen.getByText("Couldn't load earlier events"),
    ).toBeInTheDocument();
    expect(screen.getByText("No events yet")).toBeInTheDocument();
  });

  it("names the filtered vehicle when it has no events", async () => {
    renderLog([record(1, 2)], 1);
    await userEvent.click(screen.getByRole("button", { name: "VAN-01" }));
    expect(screen.getByText("No events for VAN-01")).toBeInTheDocument();
  });
});
