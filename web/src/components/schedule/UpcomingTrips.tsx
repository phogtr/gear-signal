import { TripSection } from "./TripSection";
import { TripTable, type Column } from "./TripTable";
import { RouteCell, VehicleCell } from "./TripCells";

import { useNow } from "../../lib/useNow";
import { formatWhen } from "../../lib/format";
import { departureText, type TripLabels } from "../../lib/schedule";

import type { Trip } from "../../lib/api/client";

interface Props {
  trips: Trip[] | undefined;
  labels: TripLabels;
}

export const UpcomingTrips = ({ trips, labels }: Props) => {
  const now = useNow();

  const columns: Column<Trip>[] = [
    {
      header: "Vehicle",
      className: "w-36 sm:w-44",
      cell: (t) => <VehicleCell trip={t} labels={labels} showBadge={false} />,
    },
    {
      header: "Route",
      isHiddenOnPhone: true,
      cell: (t) => <RouteCell trip={t} labels={labels} />,
    },
    {
      header: "Departs",
      className: "w-40 sm:w-52",
      cell: (t) => {
        const isDue = new Date(t.scheduledStart).getTime() <= now;
        return (
          <span className="tabular-nums">
            <time dateTime={t.scheduledStart}>
              {formatWhen(t.scheduledStart, now)}
            </time>{" "}
            <span className={isDue ? "text-warning" : "text-muted-foreground"}>
              {departureText(t, now)}
            </span>
          </span>
        );
      },
    },
  ];

  return (
    <TripSection id="upcoming" title="Upcoming" count={trips?.length}>
      <TripTable
        labelledBy="upcoming-heading"
        columns={columns}
        rows={trips}
        rowKey={(t) => t.id}
        empty="No upcoming trips. Scheduled trips show here with a countdown to departure."
      />
    </TripSection>
  );
};
