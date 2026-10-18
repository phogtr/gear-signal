import { useCallback, useState } from "react";

import { CoreMap } from "../../../components/map/CoreMap";
import { MapLegend } from "../../../components/map/MapLegend";
import { SocketStatus } from "../../../components/map/SocketStatus";
import { VehicleDetail } from "../../../components/map/VehicleDetail";
import { VehicleList } from "../../../components/map/VehicleList";

import {
  useActiveTrips,
  useDepots,
  useRoutes,
  useVehicles,
} from "../../../lib/api/queries";
import { useSocketStore } from "../../../lib/ws/socket";
import { useSocket } from "../../../lib/ws/useSocket";

import { NotebookTabIcon } from "../../../icons/NotebookTabIcon";

export const MapPage = () => {
  const depots = useDepots();
  const routes = useRoutes();
  const vehicles = useVehicles();

  useSocket();

  const trips = useActiveTrips();

  const [isListOpen, setIsListOpen] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const clearSelection = useCallback(() => setSelectedId(null), []);

  const selected = vehicles.data?.find((v) => v.id === selectedId);
  const selectedRouteId = useSocketStore(
    (s) => s.vehicles.find((v) => v.vehicleId === selectedId)?.routeId ?? null,
  );

  const error = depots.error ?? routes.error ?? vehicles.error;

  return (
    <section className="flex min-h-0 flex-1">
      <h1 className="sr-only">Main map</h1>

      <div className="relative flex-1">
        <CoreMap
          depots={depots.data ?? []}
          routes={routes.data ?? []}
          vehicles={vehicles.data ?? []}
          selectedId={selectedId}
          selectedRouteId={selectedRouteId}
          onSelect={setSelectedId}
        />

        <div className="absolute inset-x-3 bottom-16 flex flex-col gap-2 pointer-events-none sm:contents">
          <div className="self-center sm:absolute sm:bottom-8 sm:left-1/2 sm:-translate-x-1/2">
            <SocketStatus />
          </div>

          {selected && (
            <div className="pointer-events-auto sm:absolute sm:top-3 sm:left-3 sm:w-72">
              <VehicleDetail
                vehicle={selected}
                depots={depots.data ?? []}
                routes={routes.data ?? []}
                trip={trips.data?.find((t) => t.vehicleId === selected.id)}
                onClose={clearSelection}
              />
            </div>
          )}
        </div>

        <div className="pointer-events-none absolute top-3 left-3 flex flex-col items-start gap-2 sm:top-auto sm:bottom-8">
          {error && (
            <p
              role="alert"
              className="pointer-events-auto rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-danger"
            >
              Internal server error
            </p>
          )}

          {vehicles.data && (
            <div className="pointer-events-auto">
              <MapLegend vehicles={vehicles.data} />
            </div>
          )}
        </div>

        <button
          type="button"
          aria-label="Vehicle list"
          aria-expanded={isListOpen}
          aria-controls="vehicle-list"
          title={isListOpen ? "Hide vehicle list" : "Show vehicle list"}
          onClick={() => setIsListOpen((open) => !open)}
          className={`absolute top-8 left-1/2 hidden -translate-x-1/2 items-center justify-center rounded-lg border p-2 transition-colors focus-visible:outline-2 focus-visible:outline-primary md:flex [&_svg]:size-5 ${
            isListOpen
              ? "border-border bg-card text-primary"
              : "border-border bg-card text-muted-foreground hover:text-foreground"
          }`}
        >
          <span aria-hidden="true" className="flex">
            <NotebookTabIcon />
          </span>
        </button>
      </div>

      <div
        id="vehicle-list"
        className={isListOpen ? "hidden md:flex" : "hidden"}
      >
        <VehicleList
          vehicles={vehicles.data ?? []}
          depots={depots.data ?? []}
          routes={routes.data ?? []}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>
    </section>
  );
};
