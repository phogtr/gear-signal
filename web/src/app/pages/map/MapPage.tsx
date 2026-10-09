import { CoreMap } from "../../../components/map/CoreMap";
import { MapLegend } from "../../../components/map/MapLegend";

import { useDepots, useRoutes, useVehicles } from "../../../lib/api/queries";

export const MapPage = () => {
  const depots = useDepots();
  const routes = useRoutes();
  const vehicles = useVehicles();

  const error = depots.error ?? routes.error ?? vehicles.error;

  return (
    <section className="relative flex-1">
      <h1 className="sr-only">Core map</h1>

      <CoreMap
        depots={depots.data ?? []}
        routes={routes.data ?? []}
        vehicles={vehicles.data ?? []}
      />

      <div className="pointer-events-none absolute top-3 left-3 flex flex-col gap-2 sm:top-auto sm:bottom-8">
        {error && (
          <p
            role="alert"
            className="pointer-events-auto rounded border border-border bg-surface px-3 py-2 text-sm font-semibold text-danger"
          >
            Could not load data: {error.message}
          </p>
        )}

        {vehicles.data && (
          <div className="pointer-events-auto">
            <MapLegend vehicles={vehicles.data} />
          </div>
        )}
      </div>
    </section>
  );
};
