// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreateTripForm } from "../../../components/schedule/CreateTripForm";
import type {
  Availability,
  Depot,
  Route,
  Vehicle,
} from "../../../lib/api/client";
import { toDateTimeLocalInput } from "../../../lib/schedule";

const NOW = Date.parse("2026-10-22T16:04:10Z");

const depots: Depot[] = [
  { id: 1, name: "DTLA Warehouse", lat: 34, lon: -118 },
  { id: 2, name: "LAX Cargo", lat: 33.9, lon: -118.4 },
];
const route = (
  id: number,
  origin: number,
  destination: number,
  km: number,
): Route => ({
  id,
  name: `r${id}`,
  originDepotId: origin,
  destinationDepotId: destination,
  distance: km * 1000,
  duration: 1500,
  coordinates: [],
});
const routes = [route(7, 1, 2, 25), route(10, 2, 1, 26), route(5, 1, 1, 31)];
const vehicle = (
  id: number,
  name: string,
  status: Vehicle["status"],
  type: Vehicle["type"] = "ev_van",
): Vehicle => ({
  id,
  name,
  plate: "P",
  type,
  status,
  depotId: 1,
  res: 0.8,
});
const vehicles = [
  vehicle(12, "VAN-12", "idle"),
  vehicle(18, "VAN-18", "en_route"),
  vehicle(36, "TRK-08", "maintenance", "diesel_truck"),
  vehicle(20, "VAN-20", "charging"),
  vehicle(21, "VAN-21", "idle"),
  vehicle(40, "TRK-03", "idle", "diesel_truck"),
];
const at = (iso: string) => Date.parse(iso);
const inMin = (min: number) => new Date(NOW + min * 60_000).toISOString();
const availability: Availability[] = [
  {
    vehicleId: 12,
    depotId: 1,
    availableAt: "2026-10-22T16:04:10Z",
    res: 0.8,
    routes: [],
  },
  // still driving to LAX, then free there
  {
    vehicleId: 18,
    depotId: 2,
    availableAt: "2026-10-22T16:28:06.5Z",
    res: 0.8,
    routes: [],
  },
  {
    vehicleId: 36,
    depotId: 1,
    availableAt: "2026-10-22T16:04:10Z",
    res: 0.8,
    routes: [],
  },
  // plugged in now at 20%, 1 point a minute: 25% at 16:09:10, 27.4% at 16:11:34
  {
    vehicleId: 20,
    depotId: 1,
    availableAt: inMin(0),
    res: 0.2,
    charging: { since: inMin(0), until: inMin(70), target: 0.9 },
    routes: [
      { routeId: 7, need: 0.25, earliestAt: inMin(5) },
      { routeId: 5, need: 0.274, earliestAt: inMin(7.4) },
    ],
  },
  // idle at 30%, no charger: the 45% route is never possible
  {
    vehicleId: 21,
    depotId: 1,
    availableAt: inMin(0),
    res: 0.3,
    routes: [
      { routeId: 7, need: 0.25, earliestAt: inMin(0) },
      { routeId: 5, need: 0.45 },
    ],
  },
  {
    vehicleId: 40,
    depotId: 1,
    availableAt: inMin(0),
    res: 0.1,
    routes: [
      { routeId: 7, earliestAt: inMin(0) },
      { routeId: 5, earliestAt: inMin(0) },
    ],
  },
];

const renderForm = (
  props: Partial<Parameters<typeof CreateTripForm>[0]> = {},
) => {
  const onSubmit = vi.fn();
  render(
    <CreateTripForm
      vehicles={vehicles}
      depots={depots}
      routes={routes}
      availability={availability}
      isPending={false}
      error={undefined}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
      {...props}
    />,
  );
  return { onSubmit, user: userEvent.setup() };
};

const field = (name: string) => screen.getByLabelText(name);

// only Date is faked, so user-event's own timers keep working
beforeEach(() => vi.useFakeTimers({ now: NOW, toFake: ["Date"] }));
afterEach(() => vi.useRealTimers());

describe("CreateTripForm", () => {
  it("lists every vehicle with where it will be, and disables maintenance", () => {
    renderForm();
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toContain("VAN-12 - DTLA Warehouse");
    expect(options.find((o) => o?.startsWith("VAN-18"))).toMatch(
      /^VAN-18 - LAX Cargo from /,
    );
    expect(
      screen.getByRole("option", { name: "TRK-08 - in maintenance" }),
    ).toBeDisabled();
  });

  it("waits for availability before a vehicle can be chosen", () => {
    renderForm({ availability: undefined });
    // enabled, so the dialog can focus it on open, but nothing to pick yet
    expect(field("Vehicle")).toBeEnabled();
    expect(field("Vehicle")).toHaveAttribute("aria-busy", "true");
    const options = within(field("Vehicle")).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Loading vehicles…"]);
  });

  it("offers only routes leaving the depot where the vehicle will be, and a default start", async () => {
    const { user } = renderForm();
    expect(field("Route")).toBeDisabled();

    await user.selectOptions(field("Vehicle"), "18");
    const routeNames = [...(field("Route") as HTMLSelectElement).options]
      .map((o) => o.textContent)
      .slice(1);
    expect(routeNames).toEqual(["LAX Cargo → DTLA Warehouse · 26 km"]);
    expect(field("Vehicle")).toHaveAccessibleDescription(
      /Free from .* at LAX Cargo/,
    );
    expect(field("Route")).toHaveAccessibleDescription(
      "Routes leaving LAX Cargo",
    );

    // availableAt 16:28:06.5 rounds up to 16:29
    const at = Date.parse("2026-10-22T16:29:00Z");
    expect(field("Departure")).toHaveValue(toDateTimeLocalInput(at));
    expect(field("Departure")).toHaveAttribute("min", toDateTimeLocalInput(at));
  });

  it("flags missing fields, focusing the first one", async () => {
    const { user, onSubmit } = renderForm();
    await user.click(screen.getByRole("button", { name: "Schedule trip" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(field("Vehicle")).toHaveAttribute("aria-invalid", "true");
    expect(field("Vehicle")).toHaveAccessibleDescription("Choose a vehicle");
    expect(field("Route")).toHaveAccessibleDescription("Choose a route");
    expect(field("Vehicle")).toHaveFocus();
  });

  it("rejects a departure before the vehicle is free", async () => {
    const { user, onSubmit } = renderForm();
    await user.selectOptions(field("Vehicle"), "18");
    await user.selectOptions(field("Route"), "10");
    await user.clear(field("Departure"));
    await user.type(
      field("Departure"),
      toDateTimeLocalInput(Date.parse("2026-10-22T16:20:00Z")),
    );
    await user.click(screen.getByRole("button", { name: "Schedule trip" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(field("Departure")).toHaveAttribute("aria-invalid", "true");
    expect(field("Departure")).toHaveAccessibleDescription(
      /Pick a departure at or after/,
    );
    expect(field("Departure")).toHaveFocus();
  });

  it("submits the chosen trip with the start in UTC", async () => {
    const { user, onSubmit } = renderForm();
    await user.selectOptions(field("Vehicle"), "12");
    await user.selectOptions(field("Route"), "7");
    await user.click(screen.getByRole("button", { name: "Schedule trip" }));

    // free now: the default start is the next minute plus a minute of slack
    expect(onSubmit).toHaveBeenCalledWith({
      vehicleId: 12,
      routeId: 7,
      scheduledStart: "2026-10-22T16:06:00.000Z",
    });
  });

  describe("battery", () => {
    const routeOptions = () =>
      [...(field("Route") as HTMLSelectElement).options].slice(1);

    it("marks routes a charging EV must wait for", async () => {
      const { user } = renderForm();
      await user.selectOptions(field("Vehicle"), "20");
      const [first, second] = routeOptions();
      // earliest starts round up to the minute: 16:10 and 16:12
      expect(first.textContent).toMatch(
        /^DTLA Warehouse → LAX Cargo · 25 km - from /,
      );
      expect(second.textContent).toMatch(/ · 31 km - from /);
      expect(first).toBeEnabled();
    });

    it("disables a route the battery can never cover, and says why", async () => {
      const { user } = renderForm();
      await user.selectOptions(field("Vehicle"), "21");
      const [short, long] = routeOptions();
      expect(short.textContent).toBe("DTLA Warehouse → LAX Cargo · 25 km");
      expect(short).toBeEnabled();
      expect(long.textContent).toBe(
        "DTLA Warehouse → DTLA Warehouse · 31 km - not enough battery, needs 45%",
      );
      expect(long).toBeDisabled();
    });

    it("raises the departure to the route's earliest start, and says why", async () => {
      const { user } = renderForm();
      await user.selectOptions(field("Vehicle"), "20");
      expect(field("Departure")).toHaveValue(
        toDateTimeLocalInput(at("2026-10-22T16:06:00Z")),
      );

      await user.selectOptions(field("Route"), "7");
      const earliest = toDateTimeLocalInput(at("2026-10-22T16:10:00Z"));
      expect(field("Departure")).toHaveValue(earliest);
      expect(field("Departure")).toHaveAttribute("min", earliest);
      expect(field("Departure")).toHaveAccessibleDescription(
        /your local time, once VAN-20 has charged enough for this route$/,
      );
    });

    it("keeps a later departure", async () => {
      const { user } = renderForm();
      await user.selectOptions(field("Vehicle"), "20");
      await user.clear(field("Departure"));
      const later = toDateTimeLocalInput(at("2026-10-22T16:30:00Z"));
      await user.type(field("Departure"), later);
      await user.selectOptions(field("Route"), "7");

      expect(field("Departure")).toHaveValue(later);
    });

    it("rejects a departure before the battery is ready", async () => {
      const { user, onSubmit } = renderForm();
      await user.selectOptions(field("Vehicle"), "20");
      await user.selectOptions(field("Route"), "7");
      await user.clear(field("Departure"));
      await user.type(
        field("Departure"),
        toDateTimeLocalInput(at("2026-10-22T16:08:00Z")),
      );
      await user.click(screen.getByRole("button", { name: "Schedule trip" }));

      expect(onSubmit).not.toHaveBeenCalled();
      expect(field("Departure")).toHaveAccessibleDescription(
        /Pick a departure at or after .*, when VAN-20 has enough battery$/,
      );
      expect(field("Departure")).toHaveFocus();
    });

    it("submits at the route's earliest start", async () => {
      const { user, onSubmit } = renderForm();
      await user.selectOptions(field("Vehicle"), "20");
      await user.selectOptions(field("Route"), "7");
      await user.click(screen.getByRole("button", { name: "Schedule trip" }));
      expect(onSubmit).toHaveBeenCalledWith({
        vehicleId: 20,
        routeId: 7,
        scheduledStart: "2026-10-22T16:10:00.000Z",
      });
    });

    it("says nothing about battery for a truck", async () => {
      const { user } = renderForm();
      await user.selectOptions(field("Vehicle"), "40");
      expect(routeOptions().every((o) => !o.disabled)).toBe(true);
      await user.selectOptions(field("Route"), "5");
      expect(field("Route")).toHaveAccessibleDescription(
        "Routes leaving DTLA Warehouse",
      );
    });
  });

  it("shows the API's message and a pending state", () => {
    renderForm({
      error:
        "VAN-12 is reserved for trip 2337 until 16:29 UTC; pick a later start",
      isPending: true,
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "VAN-12 is reserved for trip 2337",
    );
    expect(screen.getByRole("button", { name: "Scheduling…" })).toBeDisabled();
  });
});
