import type { Depot, Route, Vehicle } from "../../../lib/api/client";
import type { AlertEvent, VehicleState } from "../../../lib/ws/types";

export const depots: Depot[] = [
  { id: 1, name: "DTLA Warehouse", lat: 34, lon: -118 },
  { id: 3, name: "Port of LA", lat: 33.7, lon: -118.2 },
];

export const routes: Route[] = [
  {
    id: 8,
    name: "dtla-port",
    originDepotId: 1,
    destinationDepotId: 3,
    distance: 40_000,
    duration: 2400,
    coordinates: [],
  },
];

export const vehicle = (
  id: number,
  name: string,
  fields: Partial<Vehicle> = {},
): Vehicle => ({
  id,
  name,
  plate: "8ABC123",
  type: "ev_van",
  status: "en_route",
  depotId: 1,
  ...fields,
});

export const live = (
  vehicleId: number,
  fields: Partial<VehicleState> = {},
): VehicleState => ({
  vehicleId,
  tripId: vehicleId * 10,
  routeId: 8,
  distance: 10_000,
  speed: 20,
  lat: 34,
  lng: -118.1,
  degree: 180,
  progress: 0.25,
  done: false,
  battery: 0.7,
  ...fields,
});

export const alert = (
  id: number,
  vehicleId: number,
  fields: Partial<AlertEvent> = {},
): AlertEvent => ({
  type: "event",
  id,
  tripId: vehicleId * 10,
  vehicleId,
  severity: "warning",
  code: "SPEEDING",
  message: "Speeding at 118 km/h",
  ts: "2026-11-03T16:52:07Z",
  ...fields,
});
