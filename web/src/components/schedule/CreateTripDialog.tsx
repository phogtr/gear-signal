import { useEffect, useRef } from "react";

import { CreateTripForm } from "./CreateTripForm";

import { useAvailable, useCreateTrip } from "../../lib/api/queries";

import type { Depot, Route, Trip, Vehicle } from "../../lib/api/client";

interface Props {
  open: boolean;
  vehicles: Vehicle[];
  depots: Depot[];
  routes: Route[];
  onClose: () => void;
  onCreated: (trip: Trip) => void;
}

export const CreateTripDialog = ({
  open,
  vehicles,
  depots,
  routes,
  onClose,
  onCreated,
}: Props) => {
  const ref = useRef<HTMLDialogElement>(null);

  const available = useAvailable(open);
  const create = useCreateTrip();
  const { reset } = create;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      reset();
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, reset]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="create-trip-heading"
      onClose={onClose}
      className="w-[calc(100%-2rem)] max-w-md m-auto p-5 rounded-lg border border-border bg-card text-foreground backdrop:bg-background/80"
    >
      <h2 id="create-trip-heading" className="text-base font-semibold">
        Schedule a trip
      </h2>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        The trip departs on its own at the chosen time
      </p>

      {/* mounted only while open, every open start from blank */}
      {open && (
        <CreateTripForm
          vehicles={vehicles}
          depots={depots}
          routes={routes}
          availability={available.data}
          isPending={create.isPending}
          error={
            create.error?.message ??
            (available.error ? "Couldn't load vehicle availability" : undefined)
          }
          onSubmit={(trip) =>
            create.mutate(trip, {
              onSuccess: (created) => {
                onCreated(created);
                onClose();
              },
            })
          }
          onCancel={onClose}
        />
      )}
    </dialog>
  );
};
