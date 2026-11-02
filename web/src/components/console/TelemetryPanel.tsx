import type { ReactNode } from "react";

import { PlannedBadge } from "../schedule/TripCells";
import { StatusIcon } from "../map/StatusIcon";
import { MetricTile } from "./MetricTile";
import { TelemetryCharts } from "./TelemetryCharts";

import { useSocketStore } from "../../lib/ws/socket";
import { useNow } from "../../lib/useNow";
import { metrics, type Metric } from "../../lib/console";
import { formatClock, formatCountdown, routeLabel } from "../../lib/format";
import { VEHICLE_STATUSES, VEHICLE_TYPE_LABELS } from "../../constants/map";

import type { Depot, Route, Trip, Vehicle } from "../../lib/api/client";

interface Props {
  vehicle: Vehicle;
  depots: Depot[];
  routes: Route[];
  trips: Trip[];
}

export const TelemetryPanel = ({ vehicle, depots, routes, trips }: Props) => {
  const live = useSocketStore((s) =>
    s.vehicles.find((v) => v.vehicleId === vehicle.id),
  );
  const completed = useSocketStore((s) => s.completed[vehicle.id]);

  const now = useNow();

  const state = live ?? completed?.state;
  const route = state && routes.find((r) => r.id === state.routeId);
  const trip = live && trips.find((t) => t.id === live.tripId);

  const header = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <h2 id="telemetry-heading" className="text-base font-semibold">
        {vehicle.name}
      </h2>
      <span className="text-xs text-muted-foreground">
        {VEHICLE_TYPE_LABELS[vehicle.type]} · {vehicle.plate}
      </span>
      {trip?.source === "planned" && <PlannedBadge />}

      <span className="ml-auto flex items-center gap-1.5 text-xs font-semibold">
        {live ? (
          <>
            <StatusIcon status="en_route" />
            Live
          </>
        ) : completed ? (
          "Trip completed"
        ) : null}
      </span>
    </div>
  );

  if (!state || !route) {
    const status = VEHICLE_STATUSES.find((s) => s.status === vehicle.status)!;
    const depot = depots.find((d) => d.id === vehicle.depotId)?.name;
    return (
      <Panel>
        {header}

        <p className="mt-3 text-sm">
          Not on a trip right now: {status.label.toLowerCase()}
          {depot && vehicle.status !== "en_route" ? ` at ${depot}` : ""}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick an active vehicle to see its live telemetry
        </p>
      </Panel>
    );
  }

  const rows: Metric[] = metrics(state, route.distance);
  if (live && trip?.eta) {
    const eta = new Date(trip.eta);
    rows.push({
      label: "ETA",
      value: formatClock(eta),
      unit: `in ${formatCountdown(eta.getTime() - now)}`,
    });
  } else if (completed && !live) {
    rows.push({ label: "Arrived", value: formatClock(completed.at), unit: "" });
  }

  return (
    <Panel>
      {header}

      <p className="mt-0.5 text-sm text-muted-foreground">
        {routeLabel(route, depots)}
      </p>

      <div
        aria-hidden="true"
        className="mt-3 h-1 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full bg-info"
          style={{ width: `${Math.round(state.progress * 100)}%` }}
        />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {rows.map((r) => (
          <MetricTile key={r.label} metric={r} />
        ))}
      </dl>

      <TelemetryCharts
        vehicleId={vehicle.id}
        data={rows.filter((r) => r.gauge)}
        startedAt={trip?.startedAt}
      />
    </Panel>
  );
};

const Panel = ({ children }: { children: ReactNode }) => (
  <section
    aria-labelledby="telemetry-heading"
    className="p-4 rounded-lg border border-border bg-card"
  >
    {children}
  </section>
);
