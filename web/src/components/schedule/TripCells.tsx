import type { Trip } from "../../lib/api/client";
import type { TripLabels } from "../../lib/schedule";

export const PlannedBadge = () => (
  <span className="px-1.5 shrink-0 rounded-full bg-secondary text-[11px] leading-4 font-semibold text-secondary-foreground">
    Planned
  </span>
);

// on phone, Route column is hidden & move under vehicle name
export const VehicleCell = ({
  trip,
  labels,
  showBadge = true,
}: {
  trip: Trip;
  labels: TripLabels;
  showBadge?: boolean;
}) => {
  const route = labels.route(trip.routeId);
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="truncate text-sm font-semibold">
          {labels.vehicle(trip.vehicleId)}
        </span>
        {showBadge && trip.source === "planned" && <PlannedBadge />}
      </div>
      <div className="truncate text-muted-foreground sm:hidden" title={route}>
        {route}
      </div>
    </div>
  );
};

export const RouteCell = ({
  trip,
  labels,
}: {
  trip: Trip;
  labels: TripLabels;
}) => {
  const route = labels.route(trip.routeId);
  return (
    <span className="block truncate" title={route}>
      {route}
    </span>
  );
};
