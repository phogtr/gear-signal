import { useMemo, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";

import { TripPicker } from "../../../components/replay/TripPicker";
import { TripReplay } from "../../../components/replay/TripReplay";
import { TripSummary } from "../../../components/replay/TripSummary";

import {
  useCompletedTrips,
  useDepots,
  useRoutes,
  useTripTrack,
  useVehicles,
} from "../../../lib/api/queries";

import { tripLabels } from "../../../lib/schedule";
import { parseId } from "../../../lib/console";
import { useNow } from "../../../lib/useNow";

import { CONSOLE_ROUTE } from "../../../constants/routes";

export const ReplayPage = () => {
  const [params] = useSearchParams();
  const tripId = parseId(params.get("trip"));
  const now = useNow(60_000);

  const vehicles = useVehicles();
  const depots = useDepots();
  const routes = useRoutes();
  const trips = useCompletedTrips();
  const track = useTripTrack(tripId);

  const labels = useMemo(
    () => tripLabels(vehicles.data ?? [], depots.data ?? [], routes.data ?? []),
    [vehicles.data, depots.data, routes.data],
  );
  const error = vehicles.error ?? depots.error ?? routes.error ?? trips.error;
  const isReady = Boolean(vehicles.data && depots.data && routes.data);

  const panel = (): ReactNode => {
    if (tripId === null)
      return <Notice>Pick a completed trip to replay it</Notice>;
    if (track.isPending) return <Notice>Loading trip {tripId}</Notice>;
    if (track.isError) {
      return (
        <p
          role="alert"
          className="p-4 rounded-lg border border-border bg-card text-sm font-semibold text-danger"
        >
          Couldn't load trip {tripId}
        </p>
      );
    }
    if (track.data === null) return <Notice>No trip with id {tripId}</Notice>;

    const { trip } = track.data;
    const name = labels.vehicle(trip.vehicleId);

    switch (trip.status) {
      case "scheduled":
        return (
          <Notice>
            {name}'s trip {tripId} hasn't started yet
          </Notice>
        );
      case "cancelled":
        return (
          <Notice>
            {name}'s trip {tripId} was cancelled, so there is nothing to replay
          </Notice>
        );
      case "active":
        return (
          <Notice>
            {name} is still on this trip.{" "}
            <Link
              to={`/${CONSOLE_ROUTE}?vehicle=${trip.vehicleId}`}
              className="text-primary underline underline-offset-2"
            >
              Watch it live in the console
            </Link>
          </Notice>
        );
    }

    const route = routes.data?.find((r) => r.id === trip.routeId);
    const ends = (depots.data ?? []).filter(
      (d) =>
        d.id === route?.originDepotId || d.id === route?.destinationDepotId,
    );

    return (
      <div className="flex min-w-0 flex-col gap-4">
        <TripReplay track={track.data} route={route} depots={ends} />

        <TripSummary
          track={track.data}
          vehicle={vehicles.data?.find((v) => v.id === trip.vehicleId)}
          route={route}
          routeText={labels.route(trip.routeId)}
          now={now}
        />
      </div>
    );
  };

  return (
    <div className="flex w-full min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-lg font-semibold">Replay</h1>

      {error && (
        <p
          role="alert"
          className="px-3 py-2 rounded-lg border border-border bg-card text-sm font-semibold text-danger"
        >
          Couldn't load data
        </p>
      )}

      {isReady && (
        <div className="grid gap-4 md:grid-cols-[16rem_1fr] md:items-start">
          <TripPicker
            trips={trips.data}
            labels={labels}
            selectedId={tripId}
            now={now}
          />

          {panel()}
        </div>
      )}
    </div>
  );
};

const Notice = ({ children }: { children: ReactNode }) => (
  <p className="p-4 rounded-lg border border-dashed border-border text-sm text-muted-foreground">
    {children}
  </p>
);
