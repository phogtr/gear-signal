// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CancelTripConfirm } from "../../../components/schedule/CancelTripConfirm";
import { formatClock } from "../../../lib/format";
import { labels, trip } from "./fixtures";

const NOW = Date.parse("2026-10-21T15:00:00Z");

const renderConfirm = (
  props: Partial<Parameters<typeof CancelTripConfirm>[0]> = {},
) => {
  const handlers = { onConfirm: vi.fn(), onKeep: vi.fn() };
  render(
    <CancelTripConfirm
      trip={trip(1)}
      labels={labels}
      now={NOW}
      isPending={false}
      error={undefined}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
};

describe("CancelTripConfirm", () => {
  it("says which trip, and focuses the safe choice", () => {
    renderConfirm();
    expect(
      screen.getByText(
        `VAN-01 won't depart on DTLA Warehouse → Port of LA at ${formatClock("2026-10-21T16:00:00Z")}. The trip moves to Recent as cancelled`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep trip" })).toHaveFocus();
  });

  it("reports the choice", async () => {
    const { onConfirm, onKeep } = renderConfirm();
    await userEvent.click(screen.getByRole("button", { name: "Cancel trip" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Keep trip" }));
    expect(onKeep).toHaveBeenCalledOnce();
  });

  it("shows the API's message and a pending state", () => {
    renderConfirm({
      isPending: true,
      error: "trip 2337 is active; only scheduled trips can be cancelled",
    });
    expect(screen.getByRole("alert")).toHaveTextContent("trip 2337 is active");
    expect(screen.getByRole("button", { name: "Cancelling…" })).toBeDisabled();
  });
});
