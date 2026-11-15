import { Link } from "react-router";

import { TripSection } from "./TripSection";
import { TripTable, type Column } from "./TripTable";
import { RouteCell, VehicleCell } from "./TripCells";

import { formatWhen } from "../../lib/format";
import { useNow } from "../../lib/useNow";
import type { TripLabels } from "../../lib/schedule";

import { REPLAY_ROUTE } from "../../constants/routes";
import type { Trip, TripSource } from "../../lib/api/client";

interface Props {
  trips: Trip[] | undefined; // newest first
  source?: TripSource;
  labels: TripLabels;
}

export const RecentTrips = ({ trips, source, labels }: Props) => {
  const now = useNow(60_000);

  const columns: Column<Trip>[] = [
    {
      header: "Vehicle",
      className: "w-36 sm:w-44",
      cell: (t) => <VehicleCell trip={t} labels={labels} />,
    },
    {
      header: "Route",
      isHiddenOnPhone: true,
      cell: (t) => <RouteCell trip={t} labels={labels} />,
    },
    {
      header: "Status",
      isHiddenOnPhone: true,
      className: "w-20 sm:w-24",
      cell: (t) =>
        t.status === "cancelled" ? (
          <span className="text-muted-foreground">Cancelled</span>
        ) : (
          "Completed"
        ),
    },
    {
      header: "When",
      className: "w-28 sm:w-44",
      cell: (t) => {
        const [label, time] =
          t.status === "completed" && t.completedAt
            ? ["arrived", t.completedAt]
            : ["planned", t.scheduledStart];
        return (
          <div className="tabular-nums">
            <span className="text-muted-foreground">{label}</span>{" "}
            <time dateTime={time}>{formatWhen(time, now)}</time>
            {t.status === "cancelled" && (
              <div className="text-muted-foreground sm:hidden">Cancelled</div>
            )}
          </div>
        );
      },
    },
    {
      header: "Action",
      isHeaderHidden: true,
      className: "w-18 sm:w-20 text-right",
      cell: (t) =>
        t.status === "completed" && (
          <Link
            to={`/${REPLAY_ROUTE}?trip=${t.id}`}
            aria-label={`Replay ${labels.vehicle(t.vehicleId)} trip arrived ${formatWhen(t.completedAt ?? t.scheduledStart, now)}`}
            className="px-2 py-1 rounded-md border border-border text-xs secondary-btn hover:border-primary hover:text-primary"
          >
            Replay
          </Link>
        ),
    },
  ];

  return (
    <TripSection id="recent" title="Recent" count={trips?.length}>
      <TripTable
        labelledBy="recent-heading"
        columns={columns}
        rows={trips}
        rowKey={(t) => t.id}
        empty={
          source === "planned"
            ? "No planned trips have finished or been cancelled yet"
            : "No finished trips yet"
        }
      />
    </TripSection>
  );
};
