import { useState } from "react";

import { StatusIcon } from "./StatusIcon";

import { useSocketStore } from "../../lib/ws/socket";
import { routeLabel } from "../../lib/format";
import { VEHICLE_STATUSES, VEHICLE_TYPE_LABELS } from "../../constants/map";

import type { Depot, Route, Vehicle } from "../../lib/api/client";

type Filter = Vehicle["status"] | "all";

interface Props {
  vehicles: Vehicle[];
  depots: Depot[];
  routes: Route[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}

export const VehicleList = ({
  vehicles,
  depots,
  routes,
  selectedId,
  onSelect,
}: Props) => {
  const [filter, setFilter] = useState<Filter>("all");

  const vehicleStates = useSocketStore((s) => s.vehicles);

  const depotName = new Map(depots.map((d) => [d.id, d.name]));
  const routeById = new Map(routes.map((r) => [r.id, r]));
  const live = new Map(vehicleStates.map((v) => [v.vehicleId, v]));

  const filtered =
    filter === "all" ? vehicles : vehicles.filter((v) => v.status === filter);

  const filters: { value: Filter; label: string; count: number }[] = [
    { value: "all", label: "All", count: vehicles.length },
    ...VEHICLE_STATUSES.map((s) => ({
      value: s.status,
      label: s.label,
      count: vehicles.filter((v) => v.status === s.status).length,
    })),
  ];

  return (
    <aside
      aria-labelledby="vehicles-heading"
      className="flex min-h-0 w-72 shrink-0 flex-col border-l border-border bg-card"
    >
      <div className="border-b border-border p-3">
        <h2 id="vehicles-heading" className="text-sm font-semibold">
          Vehicles
        </h2>

        <div
          role="group"
          aria-label="Filter by status"
          className="mt-2 flex flex-wrap gap-1"
        >
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1 rounded-full border text-xs transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                filter === f.value
                  ? "bg-secondary text-secondary-foreground shadow-xs"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              {f.label} <span className="tabular-nums">{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto" aria-label="Vehicle list">
        {filtered.map((v) => {
          const s = live.get(v.id);
          const status = VEHICLE_STATUSES.find((s) => s.status === v.status)!;
          const route = s && routeById.get(s.routeId);
          const where =
            v.status === "en_route"
              ? route && routeLabel(route, depots)
              : depotName.get(v.depotId);
          const percent = s ? Math.round(s.progress * 100) : undefined;

          return (
            <li
              key={v.id}
              className="border-b border-border text-xs last:border-b-0"
            >
              <button
                type="button"
                aria-pressed={selectedId === v.id}
                onClick={() => onSelect(selectedId === v.id ? null : v.id)}
                className={`block w-full px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${
                  selectedId === v.id ? "bg-muted" : "hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <StatusIcon status={v.status} />
                  <span className="font-semibold text-sm">{v.name}</span>
                  <span className="text-muted-foreground">
                    {VEHICLE_TYPE_LABELS[v.type]}
                  </span>
                  <span className="ml-auto">{status.label}</span>
                </div>

                <div className="mt-1 pl-4.5 flex items-center gap-2 text-muted-foreground">
                  {/* min-w-0 lets flex item shrink so truncate can ellipsize; 
                      shows full text on hover */}
                  <span className="min-w-0 truncate" title={where}>
                    {where ?? "—"}
                  </span>
                  {percent !== undefined && (
                    <span className="ml-auto shrink-0 tabular-nums">
                      {percent}%
                    </span>
                  )}
                </div>

                {percent !== undefined && (
                  <div
                    aria-hidden="true"
                    className="mt-1 ml-4.5 h-0.5 overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className="h-full bg-info"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                )}
              </button>
            </li>
          );
        })}

        {filtered.length === 0 && (
          <li className="px-3 py-6 text-center text-xs text-muted-foreground">
            No vehicles
          </li>
        )}
      </ul>
    </aside>
  );
};
