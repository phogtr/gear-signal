import { Link } from "react-router";

import { PlannedBadge } from "../schedule/TripCells";

import { useSocketStore } from "../../lib/ws/socket";
import { routeLabel } from "../../lib/format";
import { VEHICLE_TYPE_LABELS } from "../../constants/map";

import type { Depot, Route, Trip, Vehicle } from "../../lib/api/client";

interface Props {
  vehicles: Vehicle[];
  depots: Depot[];
  routes: Route[];
  trips: Trip[];
  selectedId: number | null;
}

const byName = new Intl.Collator([], { numeric: true }).compare;

export const ActiveVehiclePicker = ({
  vehicles,
  depots,
  routes,
  trips,
  selectedId,
}: Props) => {
  const states = useSocketStore((s) => s.vehicles);
  const status = useSocketStore((s) => s.status);

  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
  const routeById = new Map(routes.map((r) => [r.id, r]));
  const tripById = new Map(trips.map((t) => [t.id, t]));

  const rows = states
    .flatMap((s) => {
      const vehicle = vehicleById.get(s.vehicleId);
      return vehicle ? [{ vehicle, state: s }] : [];
    })
    .sort((a, b) => byName(a.vehicle.name, b.vehicle.name));

  return (
    <nav
      aria-labelledby="picker-heading"
      className="flex min-h-0 flex-col rounded-lg border border-border bg-card md:sticky md:top-6 md:max-h-[calc(100dvh-6rem)]"
    >
      <h2
        id="picker-heading"
        className="px-3 py-2 border-b border-border text-sm font-semibold"
      >
        Active vehicles{" "}
        <span className="font-normal text-muted-foreground tabular-nums">
          {rows.length}
        </span>
      </h2>

      <ul className="max-h-56 min-h-0 overflow-y-auto md:max-h-none md:flex-1">
        {rows.map(({ vehicle, state }) => {
          const route = routeById.get(state.routeId);
          const where = route ? routeLabel(route, depots) : "—";
          const percent = Math.round(state.progress * 100);
          const isSelected = vehicle.id === selectedId;

          return (
            <li
              key={vehicle.id}
              className="border-b border-border text-xs last:border-b-0"
            >
              <Link
                to={`?vehicle=${vehicle.id}`}
                replace
                aria-current={isSelected ? "true" : undefined}
                className={`block px-3 py-2 transition-colors focus-visible:-outline-offset-2 ${
                  isSelected ? "bg-muted" : "hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{vehicle.name}</span>
                  <span className="text-muted-foreground">
                    {VEHICLE_TYPE_LABELS[vehicle.type]}
                  </span>
                  {tripById.get(state.tripId)?.source === "planned" && (
                    <PlannedBadge />
                  )}
                  <span className="ml-auto font-mono tabular-nums">
                    {percent}%
                  </span>
                </div>
                <div
                  className="mt-0.5 truncate text-muted-foreground"
                  title={where}
                >
                  {where}
                </div>
                <div
                  aria-hidden="true"
                  className="mt-1 h-0.5 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full bg-info"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </Link>
            </li>
          );
        })}

        {rows.length === 0 && (
          <li className="px-3 py-6 text-center text-xs text-muted-foreground">
            {status === "live"
              ? "No vehicles on the road"
              : "Waiting for live data"}
          </li>
        )}
      </ul>
    </nav>
  );
};
