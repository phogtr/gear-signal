import { Link } from "react-router";

import { PlannedBadge } from "../schedule/TripCells";

import { formatWhen } from "../../lib/format";
import type { TripLabels } from "../../lib/schedule";

import type { Trip } from "../../lib/api/client";

interface Props {
  trips: Trip[] | undefined; // undefined while loading
  labels: TripLabels;
  selectedId: number | null;
  now: number;
}

const arrivedAt = (t: Trip) => t.completedAt ?? t.scheduledStart;

const byArrival = (a: Trip, b: Trip) =>
  Date.parse(arrivedAt(b)) - Date.parse(arrivedAt(a)) || b.id - a.id;

export const TripPicker = ({ trips, labels, selectedId, now }: Props) => {
  const rows = trips && [...trips].sort(byArrival);

  return (
    <nav
      aria-labelledby="trip-picker-heading"
      className="flex min-h-0 flex-col rounded-lg border border-border bg-card md:sticky md:top-6 md:max-h-[calc(100dvh-6rem)]"
    >
      <h2
        id="trip-picker-heading"
        className="px-3 py-2 border-b border-border text-sm font-semibold"
      >
        Completed trips{" "}
        {trips && (
          <span className="font-normal text-muted-foreground tabular-nums">
            {trips.length}
          </span>
        )}
      </h2>

      <ul className="max-h-56 min-h-0 overflow-y-auto md:max-h-none md:flex-1">
        {rows?.map((t) => {
          const route = labels.route(t.routeId);
          const arrived = arrivedAt(t);

          return (
            <li
              key={t.id}
              className="border-b border-border text-xs last:border-b-0"
            >
              <Link
                to={`?trip=${t.id}`}
                replace
                aria-current={t.id === selectedId ? "true" : undefined}
                className={`block px-3 py-2 transition-colors focus-visible:-outline-offset-2 ${
                  t.id === selectedId ? "bg-muted" : "hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">
                    {labels.vehicle(t.vehicleId)}
                  </span>
                  {t.source === "planned" && <PlannedBadge />}
                  <time
                    dateTime={arrived}
                    className="ml-auto text-muted-foreground tabular-nums"
                  >
                    {formatWhen(arrived, now)}
                  </time>
                </div>
                <div
                  className="mt-0.5 truncate text-muted-foreground"
                  title={route}
                >
                  {route}
                </div>
              </Link>
            </li>
          );
        })}

        {trips?.length === 0 && (
          <li className="px-3 py-6 text-center text-xs text-muted-foreground">
            No finished trips yet
          </li>
        )}
        {!trips && (
          <li className="px-3 py-6 text-center text-xs text-muted-foreground">
            Loading trips
          </li>
        )}
      </ul>
    </nav>
  );
};
