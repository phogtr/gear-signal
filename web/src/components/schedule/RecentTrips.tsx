import { TripSection } from "./TripSection";
import { TripTable, type Column } from "./TripTable";
import { RouteCell, VehicleCell } from "./TripCells";

import { useNow } from "../../lib/useNow";
import { formatWhen } from "../../lib/format";
import type { TripLabels } from "../../lib/schedule";

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
          <span className="tabular-nums">
            <span className="text-muted-foreground">{label}</span>{" "}
            <time dateTime={time}>{formatWhen(time, now)}</time>
          </span>
        );
      },
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
