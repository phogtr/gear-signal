// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SourceFilter } from "../../../components/schedule/SourceFilter";

describe("SourceFilter", () => {
  it("marks the current choice and reports changes", async () => {
    const onChange = vi.fn();
    render(<SourceFilter value={undefined} onChange={onChange} />);

    const group = screen.getByRole("group", {
      name: "Show in Active and Recent",
    });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All trips" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Planned only" }),
    ).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(screen.getByRole("button", { name: "Planned only" }));
    expect(onChange).toHaveBeenCalledWith("planned");
    await userEvent.click(screen.getByRole("button", { name: "All trips" }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});
