import { useEffect } from "react";

import { StatusIcon } from "./StatusIcon";

import { useSocketStore } from "../../lib/ws/socket";
import { useNow } from "../../lib/useNow";
import { formatClock, formatCountdown, routeLabel } from "../../lib/format";
import { VEHICLE_STATUSES, VEHICLE_TYPE_LABELS } from "../../constants/map";

import type { Depot, Route, Trip, Vehicle } from "../../lib/api/client";

interface Props {
  vehicle: Vehicle;
  depots: Depot[];
  routes: Route[];
  trip?: Trip;
  onClose: () => void;
}

export const VehicleDetail = ({
  vehicle,
  depots,
  routes,
  trip,
  onClose,
}: Props) => {
  // re-renders only this panel on every tick while vehicle moves
  const state = useSocketStore((s) =>
    s.vehicles.find((v) => v.vehicleId === vehicle.id),
  );

  const now = useNow();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const depotName = (id: number) => depots.find((d) => d.id === id)?.name;
  const route = state && routes.find((r) => r.id === state.routeId);
  const status = VEHICLE_STATUSES.find((s) => s.status === vehicle.status)!;
  const eta = trip?.eta ? new Date(trip.eta) : undefined;

  const rows: [string, string][] = [
    ["Status", status.label],
    ["Plate", vehicle.plate],
  ];
  if (state && route) {
    const remaining = Math.max(route.distance - state.distance, 0);
    rows.push(
      ["Route", routeLabel(route, depots)],
      ["Progress", `${Math.round(state.progress * 100)}%`],
      ["Speed", `${Math.round(state.speed * 3.6)} km/h`],
      ["Remaining", `${(remaining / 1000).toFixed(1)} km`],
    );
    if (eta) {
      const left = formatCountdown(eta.getTime() - now);
      rows.push(["ETA", `${formatClock(eta)} (in ${left})`]);
    }
  } else if (vehicle.status !== "en_route") {
    rows.push(["Depot", depotName(vehicle.depotId) ?? "—"]);
  }

  return (
    <section
      aria-labelledby="vehicle-detail-heading"
      className="p-3 rounded-lg border border-border bg-card text-xs"
    >
      <div className="flex items-center gap-2">
        <StatusIcon status={vehicle.status} />
        <h2 id="vehicle-detail-heading" className="text-sm font-semibold">
          {vehicle.name}
        </h2>
        <span className="text-muted-foreground">
          {VEHICLE_TYPE_LABELS[vehicle.type]}
        </span>
        <button
          type="button"
          aria-label={`Close ${vehicle.name} details`}
          onClick={onClose}
          className="ml-auto px-1 rounded-sm text-base leading-none text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        >
          ×
        </button>
      </div>

      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {state && (
        <div
          aria-hidden="true"
          className="mt-2 h-1 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full bg-info"
            style={{ width: `${Math.round(state.progress * 100)}%` }}
          />
        </div>
      )}
    </section>
  );
};
