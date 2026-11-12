import { useRef, useState, type FormEvent } from "react";

import {
  defaultStart,
  earliestStart,
  toDateTimeLocalInput,
} from "../../lib/schedule";
import { formatWhen, routeLabel } from "../../lib/format";
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

const toPercent = (fraction = 0) => `${Math.round(fraction * 100)}%`;

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
    depots.find((d) => d.id === id)?.name ?? "-";
  const vehicleName = (id: number) =>
    vehicles.find((v) => v.id === id)?.name ?? `Vehicle ${id}`;

  const availableById = new Map(availability?.map((a) => [a.vehicleId, a]));
  const chosen = availableById.get(Number(vehicleId));
  const routeOptions = chosen
    ? routes.filter((r) => r.originDepotId === chosen.depotId)
    : [];
  const byRouteId = new Map(chosen?.routes.map((r) => [r.routeId, r]));
  const picked = byRouteId.get(Number(routeId));

  const vehicleMin = chosen
    ? earliestStart(chosen.availableAt, now)
    : undefined;
  const startFrom = picked?.earliestAt ?? chosen?.availableAt;
  const minStart = startFrom ? earliestStart(startFrom, now) : undefined;
  const isWaitForCharge =
    minStart !== undefined && vehicleMin !== undefined && minStart > vehicleMin;

  const vehicleOption = (v: Vehicle) => {
    if (v.status === "maintenance") return `${v.name} - in maintenance`;

    const a = availableById.get(v.id);
    if (!a) return v.name;

    const at = Date.parse(a.availableAt);
    const where = depotName(a.depotId);
    return at > now + 60_000
      ? `${v.name} - ${where} from ${formatWhen(at, now)}`
      : `${v.name} - ${where}`;
  };

  const routeOption = (r: Route) => {
    const label = `${routeLabel(r, depots)} · ${(r.distance / 1000).toFixed(0)} km`;
    const ra = byRouteId.get(r.id);

    // unlikely fallback
    if (!ra || vehicleMin === undefined) return { label, disabled: false };
    if (!ra.earliestAt)
      return {
        label: `${label} - not enough battery, needs ${toPercent(ra.need)}`,
        disabled: true,
      };

    const at = earliestStart(ra.earliestAt, now);
    return at > vehicleMin
      ? { label: `${label} - from ${formatWhen(at, now)}`, disabled: false }
      : { label, disabled: false };
  };

  const chooseVehicle = (id: string) => {
    setVehicleId(id);
    setRouteId("");
    const a = availableById.get(Number(id));
    // oxlint-disable-next-line react/purity -- event handler, not render
    const t = Date.now();
    setStart(a ? toDateTimeLocalInput(defaultStart(a.availableAt, t)) : "");
    setErrors({});
  };

  const chooseRoute = (id: string) => {
    setRouteId(id);
    setErrors((prev) => ({ ...prev, route: undefined }));

    const earliestAt = byRouteId.get(Number(id))?.earliestAt;
    if (!earliestAt) return;
    // oxlint-disable-next-line react/purity -- event handler, not render
    const t = Date.now();
    const at = Date.parse(start);
    if (Number.isNaN(at) || at < earliestStart(earliestAt, t)) {
      setStart(toDateTimeLocalInput(defaultStart(earliestAt, t)));
      setErrors((prev) => ({ ...prev, start: undefined }));
    }
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
      const aMin = earliestStart(chosen.availableAt, t);
      const min = earliestStart(picked?.earliestAt ?? chosen.availableAt, t);
      if (Number.isNaN(at)) errs.start = "Pick a departure time";
      else if (at < min)
        errs.start =
          min > aMin
            ? `Pick a departure at or after ${formatWhen(min, t)}, when ${vehicleName(chosen.vehicleId)} has enough battery`
            : `Pick a departure at or after ${formatWhen(min, t)}`;
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

  const describedBy = (...ids: (string | false | undefined)[]) =>
    ids.filter(Boolean).join(" ") || undefined;

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
          // dialog focus this on open, disabled would focus Cancel
          autoFocus
          aria-busy={!availability}
          aria-invalid={Boolean(errors.vehicle)}
          aria-describedby={describedBy(
            chosen && "trip-vehicle-hint",
            errors.vehicle && "trip-vehicle-error",
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
            chosen && "trip-route-hint",
            errors.route && "trip-route-error",
          )}
          onChange={(e) => chooseRoute(e.target.value)}
          className={select}
        >
          <option value="">
            {chosen ? "Choose a route" : "Choose a vehicle first"}
          </option>
          {routeOptions.map((r) => {
            const { label, disabled } = routeOption(r);
            return (
              <option key={r.id} value={r.id} disabled={disabled}>
                {label}
              </option>
            );
          })}
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
          min={minStart ? toDateTimeLocalInput(minStart) : undefined}
          disabled={!chosen}
          aria-invalid={Boolean(errors.start)}
          aria-describedby={describedBy(
            minStart !== undefined && "trip-start-hint",
            errors.start && "trip-start-error",
          )}
          onChange={(e) => {
            setStart(e.target.value);
            setErrors((prev) => ({ ...prev, start: undefined }));
          }}
          className={`${select} tabular-nums`}
        />
        {minStart && (
          <p id="trip-start-hint" className="text-xs text-muted-foreground">
            Earliest {formatWhen(minStart, now)}, your local time
            {isWaitForCharge &&
              chosen &&
              `, once ${vehicleName(chosen.vehicleId)} has charged enough for this route`}
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
          className="px-4 py-2 rounded-md border border-border text-sm secondary-btn hover:bg-accent hover:text-accent-foreground"
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
