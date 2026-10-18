// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SocketStatus } from "../../../components/map/SocketStatus";
import { useSocketStore } from "../../../lib/ws/socket";

describe("SocketStatus", () => {
  it("render the connection state as text", () => {
    useSocketStore.setState({ status: "connecting" });
    render(<SocketStatus />);
    expect(screen.getByRole("status")).toHaveTextContent("Connecting…");

    act(() => useSocketStore.setState({ status: "live" }));
    expect(screen.getByRole("status")).toHaveTextContent("Live");
    // no visible pill while live, but the region stays for screen readers
    expect(screen.getByText("Live")).toHaveClass("sr-only");

    act(() => useSocketStore.setState({ status: "offline" }));
    expect(screen.getByRole("status")).toHaveTextContent("Offline, retrying…");
  });
});
