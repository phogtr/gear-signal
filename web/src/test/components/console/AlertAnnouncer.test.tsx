// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { AlertAnnouncer } from "../../../components/console/AlertAnnouncer";
import { applyEvent, useSocketStore } from "../../../lib/ws/socket";
import type { AlertEvent } from "../../../lib/ws/types";
import { alert, vehicle } from "./fixtures";

const vehicles = [vehicle(1, "VAN-01"), vehicle(2, "TRK-02")];

const receive = (...events: AlertEvent[]) =>
  act(() =>
    useSocketStore.setState((s) => ({
      events: events.reduce(applyEvent, s.events),
    })),
  );

beforeEach(() => useSocketStore.setState({ events: [] }));

describe("AlertAnnouncer", () => {
  it("announces new critical alerts only", () => {
    render(<AlertAnnouncer vehicles={vehicles} />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("");

    receive(alert(1, 1)); // warning
    receive(alert(2, 2, { severity: "info", message: "Back on route" }));
    expect(status).toHaveTextContent("");

    receive(
      alert(3, 2, { severity: "critical", message: "Off route by 201 m" }),
    );
    expect(status).toHaveTextContent(
      "Critical alert, TRK-02: Off route by 201 m",
    );
  });

  it("joins several critical alerts from one update, newest first", () => {
    render(<AlertAnnouncer vehicles={vehicles} />);
    receive(
      alert(1, 1, { severity: "critical", message: "Off route by 160 m" }),
      alert(2, 2, {
        severity: "critical",
        message: "Engine overheating at 106.2 °C",
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Critical alert, TRK-02: Engine overheating at 106.2 °C; Critical alert, VAN-01: Off route by 160 m",
    );
  });

  it("doesn't announce what was already there when the page opened", () => {
    useSocketStore.setState({
      events: [alert(5, 1, { severity: "critical" })],
    });
    render(<AlertAnnouncer vehicles={vehicles} />);
    receive(alert(6, 1)); // a new warning makes the store change
    expect(screen.getByRole("status")).toHaveTextContent("");
  });
});
