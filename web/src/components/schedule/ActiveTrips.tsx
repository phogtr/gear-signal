import { TripSection } from "./TripSection";
import { TripTable, type Column } from "./TripTable";
import { RouteCell, VehicleCell } from "./TripCells";

import { useNow } from "../../lib/useNow";
import { useSocketStore } from "../../lib/ws/socket";
import { formatCountdown, formatWhen } from "../../lib/format";
import { byStartedAt, type TripLabels } from "../../lib/schedule";

import type { Trip, TripSource } from "../../lib/api/client";

interface Props {
  trips: Trip[] | undefined;
  source?: TripSource;
  labels: TripLabels;
}

export const ActiveTrips = ({ trips, source, labels }: Props) => {
  const now = useNow();
  const states = useSocketStore((s) => s.vehicles);
  const progress = new Map(states.map((s) => [s.tripId, s.progress]));

  // active trips oldest first, new ones join at bottom, finished ones leave from the top
  const rows = trips
    ?.filter((t) => !source || t.source === source)
    .sort(byStartedAt);

  const columns: Column<Trip>[] = [
    {
      header: "Vehicle",
      className: "w-32 sm:w-44",
      cell: (t) => <VehicleCell trip={t} labels={labels} />,
    },
    {
      header: "Route",
      isHiddenOnPhone: true,
      cell: (t) => <RouteCell trip={t} labels={labels} />,
    },
    {
      header: "Progress",
      className: "w-14 sm:w-36",
      cell: (t) => {
        const p = progress.get(t.id);
        if (p === undefined)
          return <span className="text-muted-foreground">—</span>;
        const percent = Math.round(p * 100);
        return (
          <div className="flex items-center gap-2">
            <span className="w-8 tabular-nums">{percent}%</span>
            <div
              aria-hidden="true"
              className="hidden h-1 flex-1 overflow-hidden rounded-full bg-muted sm:block"
            >
              <div
                className="h-full bg-info"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      header: "Arrives",
      className: "w-32 sm:w-40",
      cell: (t) =>
        t.eta ? (
          <span className="tabular-nums">
            <time dateTime={t.eta}>{formatWhen(t.eta, now)}</time>{" "}
            <span className="text-muted-foreground">
              in {formatCountdown(new Date(t.eta).getTime() - now)}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <TripSection id="active" title="Active" count={rows?.length}>
      <TripTable
        labelledBy="active-heading"
        columns={columns}
        rows={rows}
        rowKey={(t) => t.id}
        empty={
          source === "planned"
            ? "None of the planned trips are on the road"
            : "No vehicles on the road"
        }
      />
    </TripSection>
  );
};
