import { PlannedBadge } from "../schedule/TripCells";

import { formatDuration, formatWhen } from "../../lib/format";
import { summarizeTrack } from "../../lib/replay";

import { VEHICLE_TYPE_LABELS } from "../../constants/map";
import type { Route, TripTrack, Vehicle } from "../../lib/api/client";

interface Props {
  track: TripTrack;
  vehicle: Vehicle | undefined;
  route: Route | undefined;
  routeText: string;
  now: number;
}

export const TripSummary = ({
  track,
  vehicle,
  route,
  routeText,
  now,
}: Props) => {
  const { trip, points } = track;
  const summary = summarizeTrack(track);
  const gapCount = summary.gaps.length;

  return (
    <section
      aria-labelledby="trip-heading"
      className="flex flex-col gap-3 p-4 rounded-lg border border-border bg-card"
    >
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="trip-heading" className="text-base font-semibold">
            {vehicle?.name ?? `Vehicle ${trip.vehicleId}`}
          </h2>
          {vehicle && (
            <span className="text-xs text-muted-foreground">
              {VEHICLE_TYPE_LABELS[vehicle.type]}
            </span>
          )}
          {trip.source === "planned" && <PlannedBadge />}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {routeText}
          {route && ` · ${(route.distance / 1000).toFixed(1)} km`}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Departed</dt>
          <dd className="tabular-nums">
            <time dateTime={trip.startedAt}>
              {formatWhen(summary.start, now)}
            </time>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Arrived</dt>
          <dd className="tabular-nums">
            <time dateTime={trip.completedAt}>
              {formatWhen(summary.end, now)}
            </time>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Duration</dt>
          <dd className="tabular-nums">
            {formatDuration(summary.end - summary.start)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Alerts</dt>
          <dd className="tabular-nums">{summary.alerts || "None"}</dd>
        </div>
      </dl>

      {summary.state === "empty" && (
        <p className="text-sm text-muted-foreground">
          No telemetry was archived for this trip. The archive keeps 14 days and
          records nothing while the server is down
        </p>
      )}
      {summary.state === "arrival-only" && (
        <p className="text-sm text-muted-foreground">
          Only the arrival was recorded, so there is nothing to play back
        </p>
      )}
      {summary.state === "ready" && (
        <p className="text-sm tabular-nums">
          <span className="text-muted-foreground">Recorded</span>{" "}
          {points.length} points
          {gapCount > 0 && (
            <span className="text-warning">
              , {gapCount} {gapCount === 1 ? "gap" : "gaps"} with{" "}
              {formatDuration(summary.missing)} missing
            </span>
          )}
        </p>
      )}
    </section>
  );
};
