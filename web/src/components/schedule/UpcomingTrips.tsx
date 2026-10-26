import type { Ref } from "react";

import { TripSection } from "./TripSection";
import { TripTable, type Column } from "./TripTable";
import { RouteCell, VehicleCell } from "./TripCells";

import { useNow } from "../../lib/useNow";
import { formatWhen } from "../../lib/format";
import {
  departureText,
  lastOfChains,
  type TripLabels,
} from "../../lib/schedule";

import type { Trip } from "../../lib/api/client";

interface Props {
  trips: Trip[] | undefined;
  labels: TripLabels;
  onCancel?: (trip: Trip) => void;
  headingRef?: Ref<HTMLHeadingElement>;
}

export const UpcomingTrips = ({
  trips,
  labels,
  onCancel,
  headingRef,
}: Props) => {
  const now = useNow();

  const cancellable = lastOfChains(trips ?? []);
  const hasChain = Boolean(trips && cancellable.size < trips.length);

  const columns: Column<Trip>[] = [
    {
      header: "Vehicle",
      className: "w-28 sm:w-44",
      cell: (t) => <VehicleCell trip={t} labels={labels} showBadge={false} />,
    },
    {
      header: "Route",
      isHiddenOnPhone: true,
      cell: (t) => <RouteCell trip={t} labels={labels} />,
    },
    {
      header: "Departs",
      className: "w-36 sm:w-52",
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

  if (onCancel) {
    columns.push({
      header: "Action",
      isHeaderHidden: true,
      className: "w-20 sm:w-24 text-right",
      cell: (t) =>
        cancellable.has(t.id) && (
          <button
            type="button"
            aria-label={`Cancel ${labels.vehicle(t.vehicleId)} trip departing ${formatWhen(t.scheduledStart, now)}`}
            onClick={() => onCancel(t)}
            className="px-2 py-1 rounded-md border border-border text-xs secondary-btn hover:border-danger hover:text-danger"
          >
            Cancel
          </button>
        ),
    });
  }

  return (
    <TripSection
      id="upcoming"
      title="Upcoming"
      count={trips?.length}
      headingRef={headingRef}
    >
      <TripTable
        labelledBy="upcoming-heading"
        columns={columns}
        rows={trips}
        rowKey={(t) => t.id}
        empty="No upcoming trips. Scheduled trips show here with a countdown to departure"
      />

      {onCancel && hasChain && (
        <p className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
          Only vehicle's latest planned trip can be cancelled
        </p>
      )}
    </TripSection>
  );
};
