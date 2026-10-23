import type { Trip } from "../../../lib/api/client";
import type { TripLabels } from "../../../lib/schedule";

export const labels: TripLabels = {
  vehicle: (id) => `VAN-0${id}`,
  route: (id) =>
    id === 8 ? "DTLA Warehouse → Port of LA" : "LAX Cargo → DTLA Warehouse",
};

export const trip = (id: number, fields: Partial<Trip> = {}): Trip => ({
  id,
  vehicleId: id,
  routeId: 8,
  scheduledStart: "2026-10-21T16:00:00Z",
  status: "scheduled",
  source: "planned",
  ...fields,
});

// cells of each body row, as text
export const rowTexts = (table: HTMLElement) =>
  [...table.querySelectorAll("tbody tr")].map((r) => r.textContent ?? "");
