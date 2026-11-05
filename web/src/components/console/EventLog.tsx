import { useState } from "react";
import { Link } from "react-router";

import { SeverityLabel } from "./Severity";

import { formatTime } from "../../lib/format";

import type { EventRecord, Vehicle } from "../../lib/api/client";

interface Props {
  events: EventRecord[]; // history + live, newest first
  isLoading: boolean;
  isHistoryError: boolean;
  vehicles: Vehicle[];
  selectedId: number | null;
}

export const EventLog = ({
  events,
  isLoading,
  isHistoryError,
  vehicles,
  selectedId,
}: Props) => {
  const [onlySelected, setOnlySelected] = useState(false);

  const nameById = new Map(vehicles.map((v) => [v.id, v.name]));
  const selectedName =
    selectedId === null ? undefined : nameById.get(selectedId);
  const isFiltered = onlySelected && selectedName !== undefined;
  const rows = isFiltered
    ? events.filter((e) => e.vehicleId === selectedId)
    : events;

  return (
    <section
      aria-labelledby="events-heading"
      className="flex min-h-0 flex-col rounded-lg border border-border bg-card md:col-start-2 xl:col-start-3 xl:sticky xl:top-6 xl:max-h-[calc(100dvh-6rem)]"
    >
      <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-border">
        <h2 id="events-heading" className="text-sm font-semibold">
          Events{" "}
          <span className="font-normal text-muted-foreground tabular-nums">
            {rows.length}
          </span>
        </h2>

        {selectedName && (
          <div role="group" aria-label="Show events for" className="flex gap-1">
            {[false, true].map((only) => (
              <button
                key={String(only)}
                type="button"
                aria-pressed={onlySelected === only}
                onClick={() => setOnlySelected(only)}
                className={`px-2.5 py-0.5 rounded-full border text-xs transition-colors ${
                  onlySelected === only
                    ? "bg-secondary text-secondary-foreground shadow-xs"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                {only ? selectedName : "All vehicles"}
              </button>
            ))}
          </div>
        )}
      </div>

      {isHistoryError && (
        <p className="px-3 py-2 border-b border-border text-xs text-danger">
          Couldn't load earlier events
        </p>
      )}

      <ol className="max-h-96 min-h-0 overflow-y-auto xl:max-h-none xl:flex-1">
        {rows.map((e) => {
          return (
            <li
              key={e.id}
              className="px-3 py-2 border-b border-border text-xs last:border-b-0"
            >
              <div className="flex items-center gap-2">
                <SeverityLabel severity={e.severity} />

                <Link
                  to={`?vehicle=${e.vehicleId}`}
                  replace
                  className="font-semibold hover:underline"
                >
                  {nameById.get(e.vehicleId) ?? `Vehicle ${e.vehicleId}`}
                </Link>
                <time
                  dateTime={e.ts}
                  className="ml-auto font-mono text-muted-foreground tabular-nums"
                >
                  {formatTime(e.ts)}
                </time>
              </div>
              <p className="mt-0.5">{e.message}</p>
            </li>
          );
        })}

        {rows.length === 0 && (
          <li className="px-3 py-6 text-center text-xs text-muted-foreground">
            {isLoading
              ? "Loading events"
              : isFiltered
                ? `No events for ${selectedName}`
                : "No events yet"}
          </li>
        )}
      </ol>
    </section>
  );
};
