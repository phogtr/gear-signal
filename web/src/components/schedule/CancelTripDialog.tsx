import { useEffect, useRef } from "react";

import { CancelTripConfirm } from "./CancelTripConfirm";

import { useCancelTrip } from "../../lib/api/queries";
import { useNow } from "../../lib/useNow";

import type { TripLabels } from "../../lib/schedule";
import type { Trip } from "../../lib/api/client";

interface Props {
  trip: Trip | null;
  labels: TripLabels;
  onClose: () => void;
  onCancelled: (trip: Trip) => void;
}

export const CancelTripDialog = ({
  trip,
  labels,
  onClose,
  onCancelled,
}: Props) => {
  const now = useNow(15_000);

  const ref = useRef<HTMLDialogElement>(null);
  const cancelled = useRef<Trip | null>(null);

  const cancel = useCancelTrip();
  const { reset } = cancel;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (trip && !dialog.open) {
      reset();
      dialog.showModal();
    } else if (!trip && dialog.open) {
      dialog.close();
    }
  }, [trip, reset]);

  const handleClose = () => {
    const done = cancelled.current;
    cancelled.current = null;
    onClose();
    if (done) onCancelled(done);
  };

  return (
    <dialog
      ref={ref}
      role="alertdialog"
      aria-labelledby="cancel-trip-heading"
      aria-describedby="cancel-trip-desc"
      onClose={handleClose}
      className="w-[calc(100%-2rem)] max-w-md m-auto p-5 rounded-lg border border-border bg-card text-foreground backdrop:bg-background/80"
    >
      <h2 id="cancel-trip-heading" className="text-base font-semibold">
        Cancel this trip?
      </h2>

      {trip && (
        <CancelTripConfirm
          trip={trip}
          labels={labels}
          now={now}
          isPending={cancel.isPending}
          error={cancel.error?.message}
          onConfirm={() =>
            cancel.mutate(trip.id, {
              onSuccess: (t) => {
                cancelled.current = t;
                ref.current?.close();
              },
            })
          }
          onKeep={() => ref.current?.close()}
        />
      )}
    </dialog>
  );
};
