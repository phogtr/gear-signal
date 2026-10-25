import { useRef, useState, type FormEvent } from "react";

import { formatWhen, routeLabel } from "../../lib/format";
import { defaultStart, earliestStart, toLocalInput } from "../../lib/schedule";
import { useNow } from "../../lib/useNow";

import type {
  Availability,
  Depot,
  NewTrip,
  Route,
  Vehicle,
} from "../../lib/api/client";

interface Props {
  vehicles: Vehicle[];
  depots: Depot[];
  routes: Route[];
  availability: Availability[] | undefined; // undefined while loading
  isPending: boolean;
  error: string | undefined;
  onSubmit: (trip: NewTrip) => void;
  onCancel: () => void;
}

interface Errors {
  vehicle?: string;
  route?: string;
  start?: string;
}

const select =
  "w-full px-3 py-2 rounded-md border border-input bg-background shadow-xs text-sm disabled:opacity-50 aria-invalid:border-danger";

export const CreateTripForm = ({
  vehicles,
  depots,
  routes,
  availability,
  isPending,
  error,
  onSubmit,
  onCancel,
}: Props) => {
  const now = useNow(15_000);

  const [vehicleId, setVehicleId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [start, setStart] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  const vehicleRef = useRef<HTMLSelectElement>(null);
  const routeRef = useRef<HTMLSelectElement>(null);
  const startRef = useRef<HTMLInputElement>(null);

  const depotName = (id: number) =>
    depots.find((d) => d.id === id)?.name ?? "—";
  const availableById = new Map(availability?.map((a) => [a.vehicleId, a]));
  const chosen = availableById.get(Number(vehicleId));
  const routeOptions = chosen
    ? routes.filter((r) => r.originDepotId === chosen.depotId)
    : [];
  const minStart = chosen ? earliestStart(chosen.availableAt, now) : undefined;

  const vehicleOption = (v: Vehicle) => {
    if (v.status === "maintenance") return `${v.name} — in maintenance`;

    const a = availableById.get(v.id);
    if (!a) return v.name;

    const at = Date.parse(a.availableAt);
    const where = depotName(a.depotId);
    return at > now + 60_000
      ? `${v.name} — ${where} from ${formatWhen(at, now)}`
      : `${v.name} — ${where}`;
  };

  const chooseVehicle = (id: string) => {
    setVehicleId(id);
    setRouteId("");
    const a = availableById.get(Number(id));
    // oxlint-disable-next-line react/purity -- event handler, not render
    const t = Date.now();
    // convert to input type datetime-local
    setStart(a ? toLocalInput(defaultStart(a.availableAt, t)) : "");
    setErrors({});
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    // oxlint-disable-next-line react/purity -- event handler, not render
    const t = Date.now();
    const errs: Errors = {};
    const at = Date.parse(start);
    if (!chosen) errs.vehicle = "Choose a vehicle";
    if (!routeId) errs.route = "Choose a route";

    if (chosen) {
      // re-check current time, form may have opened a while
      const min = earliestStart(chosen.availableAt, t);
      if (Number.isNaN(at)) errs.start = "Pick a departure time";
      else if (at < min)
        errs.start = `Pick a departure at or after ${formatWhen(min, t)}`;
    }

    setErrors(errs);
    const firstInvalid = errs.vehicle
      ? vehicleRef
      : errs.route
        ? routeRef
        : errs.start
          ? startRef
          : undefined;
    if (firstInvalid) {
      firstInvalid.current?.focus();
      return;
    }

    onSubmit({
      vehicleId: Number(vehicleId),
      routeId: Number(routeId),
      scheduledStart: new Date(at).toISOString(),
    });
  };

  const describedBy = (id: string, hasHint: boolean, hasError: boolean) =>
    [hasHint && `${id}-hint`, hasError && `${id}-error`]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger/60 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="trip-vehicle" className="text-sm font-medium">
          Vehicle
        </label>
        <select
          id="trip-vehicle"
          ref={vehicleRef}
          value={vehicleId}
          // dialog focus this on open, disabled would focus Cancel;
          autoFocus
          aria-busy={!availability}
          aria-invalid={Boolean(errors.vehicle)}
          aria-describedby={describedBy(
            "trip-vehicle",
            Boolean(chosen),
            Boolean(errors.vehicle),
          )}
          onChange={(e) => chooseVehicle(e.target.value)}
          className={select}
        >
          <option value="">
            {availability ? "Choose a vehicle" : "Loading vehicles…"}
          </option>
          {availability &&
            vehicles.map((v) => (
              <option
                key={v.id}
                value={v.id}
                disabled={v.status === "maintenance"}
              >
                {vehicleOption(v)}
              </option>
            ))}
        </select>

        {chosen && (
          <p id="trip-vehicle-hint" className="text-xs text-muted-foreground">
            {Date.parse(chosen.availableAt) > now + 60_000
              ? `Free from ${formatWhen(chosen.availableAt, now)} at ${depotName(chosen.depotId)}, after its planned trips`
              : `Parked at ${depotName(chosen.depotId)}`}
          </p>
        )}
        {errors.vehicle && (
          <p id="trip-vehicle-error" className="text-xs text-danger">
            {errors.vehicle}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="trip-route" className="text-sm font-medium">
          Route
        </label>
        <select
          id="trip-route"
          ref={routeRef}
          value={routeId}
          disabled={!chosen}
          aria-invalid={Boolean(errors.route)}
          aria-describedby={describedBy(
            "trip-route",
            Boolean(chosen),
            Boolean(errors.route),
          )}
          onChange={(e) => {
            setRouteId(e.target.value);
            setErrors((prev) => ({ ...prev, route: undefined }));
          }}
          className={select}
        >
          <option value="">
            {chosen ? "Choose a route" : "Choose a vehicle first"}
          </option>
          {routeOptions.map((r) => (
            <option key={r.id} value={r.id}>
              {routeLabel(r, depots)} · {(r.distance / 1000).toFixed(0)} km
            </option>
          ))}
        </select>

        {chosen && (
          <p id="trip-route-hint" className="text-xs text-muted-foreground">
            Routes leaving {depotName(chosen.depotId)}
          </p>
        )}
        {errors.route && (
          <p id="trip-route-error" className="text-xs text-danger">
            {errors.route}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="trip-start" className="text-sm font-medium">
          Departure
        </label>
        <input
          id="trip-start"
          ref={startRef}
          type="datetime-local"
          value={start}
          min={minStart ? toLocalInput(minStart) : undefined}
          disabled={!chosen}
          aria-invalid={Boolean(errors.start)}
          aria-describedby={describedBy(
            "trip-start",
            Boolean(minStart),
            Boolean(errors.start),
          )}
          onChange={(e) => {
            setStart(e.target.value);
            setErrors((prev) => ({ ...prev, start: undefined }));
          }}
          className={`${select} tabular-nums`}
        />
        {minStart && (
          <p id="trip-start-hint" className="text-xs text-muted-foreground">
            Earliest {formatWhen(minStart, now)}, your local time.
          </p>
        )}
        {errors.start && (
          <p id="trip-start-error" className="text-xs text-danger">
            {errors.start}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent hover:text-accent-foreground"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-offset-2 disabled:opacity-60"
        >
          {isPending ? "Scheduling…" : "Schedule trip"}
        </button>
      </div>
    </form>
  );
};
