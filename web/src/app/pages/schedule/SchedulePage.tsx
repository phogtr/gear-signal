import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import { ActiveTrips } from "../../../components/schedule/ActiveTrips";
import { RecentTrips } from "../../../components/schedule/RecentTrips";
import { SourceFilter } from "../../../components/schedule/SourceFilter";
import { UpcomingTrips } from "../../../components/schedule/UpcomingTrips";
import { CreateTripDialog } from "../../../components/schedule/CreateTripDialog";

import {
  useActiveTrips,
  useDepots,
  useRecentTrips,
  useRoutes,
  useUpcomingTrips,
  useVehicles,
} from "../../../lib/api/queries";
import { useSocket } from "../../../lib/ws/useSocket";
import { tripLabels } from "../../../lib/schedule";
import { formatWhen } from "../../../lib/format";

import type { Trip, TripSource } from "../../../lib/api/client";

const CREATED_MSG_MS = 8000;

export const SchedulePage = () => {
  const [params, setParams] = useSearchParams();
  const source: TripSource | undefined =
    params.get("source") === "planned" ? "planned" : undefined;

  useSocket();

  const vehicles = useVehicles();
  const depots = useDepots();
  const routes = useRoutes();
  const upcoming = useUpcomingTrips();
  const active = useActiveTrips();
  const recent = useRecentTrips(source);

  const labels = useMemo(
    () => tripLabels(vehicles.data ?? [], depots.data ?? [], routes.data ?? []),
    [vehicles.data, depots.data, routes.data],
  );
  // rows wait for names, so they never flash "Vehicle 12"
  const isReady = Boolean(vehicles.data && depots.data && routes.data);

  const [isCreate, setIsCreate] = useState(false);
  const [createdMsg, setCreatedMsg] = useState("");

  useEffect(() => {
    if (!createdMsg) return;

    const id = setTimeout(() => setCreatedMsg(""), CREATED_MSG_MS);
    return () => clearTimeout(id);
  }, [createdMsg]);

  const onCreated = (t: Trip) =>
    setCreatedMsg(
      `Scheduled ${labels.vehicle(t.vehicleId)}, ${labels.route(t.routeId)}, departing ${formatWhen(t.scheduledStart, Date.now())}`,
    );

  const error =
    upcoming.error ??
    active.error ??
    recent.error ??
    vehicles.error ??
    depots.error ??
    routes.error;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Schedule</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Trips planned ahead, on the road, and recently finished
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SourceFilter
            value={source}
            onChange={(s) =>
              setParams(s ? { source: s } : {}, { replace: true })
            }
          />

          <button
            type="button"
            disabled={!isReady}
            onClick={() => setIsCreate(true)}
            className="px-3 py-1.5 rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-offset-2 disabled:opacity-60"
          >
            Schedule trip
          </button>
        </div>
      </div>

      <p
        role="status"
        className="text-sm text-success font-semibold empty:hidden"
      >
        {createdMsg}
      </p>

      <CreateTripDialog
        open={isCreate}
        vehicles={vehicles.data ?? []}
        depots={depots.data ?? []}
        routes={routes.data ?? []}
        onClose={() => setIsCreate(false)}
        onCreated={onCreated}
      />

      {error && (
        <p
          role="alert"
          className="px-3 py-2 rounded-lg border border-border bg-card text-sm font-semibold text-danger"
        >
          Couldn't load trips
        </p>
      )}

      <UpcomingTrips
        trips={isReady ? upcoming.data : undefined}
        labels={labels}
      />
      <ActiveTrips
        trips={isReady ? active.data : undefined}
        source={source}
        labels={labels}
      />
      <RecentTrips
        trips={isReady ? recent.data : undefined}
        source={source}
        labels={labels}
      />
    </div>
  );
};
