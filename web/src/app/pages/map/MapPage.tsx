import { CoreMap } from "../../../components/map/CoreMap";
import { MapLegend } from "../../../components/map/MapLegend";
import { SocketStatus } from "../../../components/map/SocketStatus";

import { useDepots, useRoutes, useVehicles } from "../../../lib/api/queries";
import { useSocket } from "../../../lib/ws/useSocket";

export const MapPage = () => {
  const depots = useDepots();
  const routes = useRoutes();
  const vehicles = useVehicles();

  useSocket();

  const error = depots.error ?? routes.error ?? vehicles.error;

  return (
    <section className="relative flex-1">
      <h1 className="sr-only">Core map</h1>

      <CoreMap
        depots={depots.data ?? []}
        routes={routes.data ?? []}
        vehicles={vehicles.data ?? []}
      />

      <div className="pointer-events-none absolute top-3 left-3 flex flex-col items-start gap-2 sm:top-auto sm:bottom-8">
        {error && (
          <p
            role="alert"
            className="pointer-events-auto rounded border border-border bg-card px-3 py-2 text-sm font-semibold text-danger"
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

      <div className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 sm:bottom-8">
        <SocketStatus />
      </div>
    </section>
  );
};
