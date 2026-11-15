import { useSearchParams } from "react-router";

import { ActiveVehiclePicker } from "../../../components/console/ActiveVehiclePicker";
import { AlertAnnouncer } from "../../../components/console/AlertAnnouncer";
import { EventLog } from "../../../components/console/EventLog";
import { TelemetryPanel } from "../../../components/console/TelemetryPanel";
import { SocketStatus } from "../../../components/map/SocketStatus";

import {
  useActiveTrips,
  useDepots,
  useRoutes,
  useVehicles,
} from "../../../lib/api/queries";
import { useSocket } from "../../../lib/ws/useSocket";
import { useAlerts } from "../../../lib/useAlerts";
import { parseId } from "../../../lib/console";

export const ConsolePage = () => {
  const [params] = useSearchParams();
  const selectedId = parseId(params.get("vehicle"));

  useSocket();

  const vehicles = useVehicles();
  const depots = useDepots();
  const routes = useRoutes();
  const trips = useActiveTrips();
  const { events, alertByTripId, history } = useAlerts();

  const error = vehicles.error ?? depots.error ?? routes.error ?? trips.error;
  // rows wait for names, so they never flash "No vehicles"
  const isReady = Boolean(vehicles.data && depots.data && routes.data);
  const selected = vehicles.data?.find((v) => v.id === selectedId);

  return (
    <div className="flex w-full min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Console</h1>
        </div>
        <SocketStatus />
      </div>

      {error && (
        <p
          role="alert"
          className="px-3 py-2 rounded-lg border border-border bg-card text-sm font-semibold text-danger"
        >
          Couldn't load fleet data
        </p>
      )}

      {vehicles.data && <AlertAnnouncer vehicles={vehicles.data} />}

      {isReady && (
        <div className="grid gap-4 md:grid-cols-[16rem_1fr] md:items-start xl:grid-cols-[16rem_1fr_20rem]">
          <ActiveVehiclePicker
            vehicles={vehicles.data!}
            depots={depots.data!}
            routes={routes.data!}
            trips={trips.data ?? []}
            alertByTripId={alertByTripId}
            selectedId={selectedId}
          />

          {selected ? (
            <TelemetryPanel
              key={selected.id}
              vehicle={selected}
              depots={depots.data!}
              routes={routes.data!}
              trips={trips.data ?? []}
              alertByTripId={alertByTripId}
            />
          ) : (
            <p className="p-4 rounded-lg border border-dashed border-border text-sm text-muted-foreground">
              {selectedId === null
                ? "Pick an active vehicle to see its live telemetry"
                : `No vehicle with id ${selectedId}`}
            </p>
          )}

          <EventLog
            events={events}
            isLoading={history.isPending}
            isHistoryError={history.isError}
            vehicles={vehicles.data!}
            selectedId={selectedId}
          />
        </div>
      )}
    </div>
  );
};
