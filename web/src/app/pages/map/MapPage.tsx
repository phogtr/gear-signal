import { useState } from "react";

import { CoreMap } from "../../../components/map/CoreMap";
import { MapLegend } from "../../../components/map/MapLegend";
import { SocketStatus } from "../../../components/map/SocketStatus";
import { VehicleList } from "../../../components/map/VehicleList";

import { useDepots, useRoutes, useVehicles } from "../../../lib/api/queries";
import { useSocket } from "../../../lib/ws/useSocket";

import { NotebookTabIcon } from "../../../icons/NotebookTabIcon";

export const MapPage = () => {
  const depots = useDepots();
  const routes = useRoutes();
  const vehicles = useVehicles();

  useSocket();

  const [isListOpen, setIsListOpen] = useState(true);

  const error = depots.error ?? routes.error ?? vehicles.error;

  return (
    <section className="flex min-h-0 flex-1">
      <h1 className="sr-only">Main map</h1>

      <div className="relative flex-1">
        <CoreMap
          depots={depots.data ?? []}
          routes={routes.data ?? []}
          vehicles={vehicles.data ?? []}
        />

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

        <div className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 sm:bottom-8">
          <SocketStatus />
        </div>
      </div>

      <div
        id="vehicle-list"
        className={isListOpen ? "hidden md:flex" : "hidden"}
      >
        <VehicleList
          vehicles={vehicles.data ?? []}
          depots={depots.data ?? []}
          routes={routes.data ?? []}
        />
      </div>
    </section>
  );
};
