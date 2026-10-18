// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MapLegend } from "../../../components/map/MapLegend";
import type { Vehicle } from "../../../lib/api/client";

const vehicle = (id: number, status: Vehicle["status"]): Vehicle => ({
  id,
  name: `VAN-${id}`,
  plate: `PLATE${id}`,
  type: "ev_van",
  status,
  depotId: 1,
});

const rowOf = (label: string) => screen.getByText(label).closest("li")!;

describe("MapLegend", () => {
  it("is a labelled region", () => {
    render(<MapLegend vehicles={[]} />);
    expect(
      screen.getByRole("region", { name: "Map legend" }),
    ).toBeInTheDocument();
  });

  it("counts vehicles per status", () => {
    render(
      <MapLegend
        vehicles={[
          vehicle(1, "idle"),
          vehicle(2, "idle"),
          vehicle(3, "idle"),
          vehicle(4, "charging"),
          vehicle(5, "maintenance"),
        ]}
      />,
    );

    expect(within(rowOf("En route")).getByText("0")).toBeInTheDocument();
    expect(within(rowOf("Idle")).getByText("3")).toBeInTheDocument();
    expect(within(rowOf("Charging")).getByText("1")).toBeInTheDocument();
    expect(within(rowOf("Maintenance")).getByText("1")).toBeInTheDocument();
  });

  it("lists every status and the depot marker in order", () => {
    render(<MapLegend vehicles={[]} />);
    const rows = within(screen.getByRole("list")).getAllByRole("listitem");

    expect(rows.map((r) => r.textContent)).toEqual([
      "En route0",
      "Idle0",
      "Charging0",
      "Maintenance0",
      "Depot",
    ]);
  });

  // color is never the only signal: icons are decorative, the label carries the meaning
  it("hides the icons from assistive tech", () => {
    render(<MapLegend vehicles={[]} />);
    for (const row of screen.getAllByRole("listitem")) {
      expect(row.firstElementChild).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("matches the map's hollow triangle for en route", () => {
    render(<MapLegend vehicles={[]} />);
    const swatch = screen
      .getByText("En route")
      .closest("li")!.firstElementChild!;
    expect(swatch.tagName.toLowerCase()).toBe("svg");
    expect(swatch).toHaveClass("fill-none");
    expect(swatch).toHaveStyle({ stroke: "var(--color-info)" });
  });
});
