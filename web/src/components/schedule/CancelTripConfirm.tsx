import { formatWhen } from "../../lib/format";

import type { TripLabels } from "../../lib/schedule";
import type { Trip } from "../../lib/api/client";

interface Props {
  trip: Trip;
  labels: TripLabels;
  now: number;
  isPending: boolean;
  error: string | undefined;
  onConfirm: () => void;
  onKeep: () => void;
}

export const CancelTripConfirm = ({
  trip,
  labels,
  now,
  isPending,
  error,
  onConfirm,
  onKeep,
}: Props) => {
  return (
    <>
      <p id="cancel-trip-desc" className="mt-1 text-sm text-muted-foreground">
        {labels.vehicle(trip.vehicleId)} won't depart on{" "}
        {labels.route(trip.routeId)} at {formatWhen(trip.scheduledStart, now)}.
        The trip moves to Recent as cancelled
      </p>

      {error && (
        <p
          role="alert"
          className="mt-4 px-3 py-2 rounded-md border border-danger/60 text-sm text-danger"
        >
          {error}
        </p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          autoFocus
          onClick={onKeep}
          className="px-4 py-2 rounded-md border border-border text-sm secondary-btn hover:bg-accent hover:text-accent-foreground"
        >
          Keep trip
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={onConfirm}
          className="px-4 py-2 rounded-md bg-danger text-sm font-semibold text-danger-foreground hover:bg-danger/90 focus-visible:outline-offset-2 disabled:opacity-60"
        >
          {isPending ? "Cancelling…" : "Cancel trip"}
        </button>
      </div>
    </>
  );
};
