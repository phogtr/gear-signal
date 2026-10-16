import type {
  Feature,
  FeatureCollection,
  LineString,
  Point as GeoPoint,
} from "geojson";

import type { Depot, Route, Vehicle } from "../api/client";
import type { MovingVehicle } from "./motion";

type Point = [lng: number, lat: number];

const EARTH_CIRCUMFERENCE = 40_075_016.686; // 2 × π × 6,378,137
const METERS_PER_DEGREE_LAT = 111_320; // EARTH_CIRCUMFERENCE / 360 -> 2πR / 360 = πR / 180
const TILE_SIZE_PX = 512; // MapLibre's tile size

// ground distance covered by one screen pixel at a zoom level and latitude
// https://learn.microsoft.com/en-us/bingmaps/articles/bing-maps-tile-system#ground-resolution-and-map-scale
export const metersPerPixel = (zoom: number, lat: number): number =>
  (EARTH_CIRCUMFERENCE * Math.cos((lat * Math.PI) / 180)) /
  (TILE_SIZE_PX * 2 ** zoom);

export const routesToGeoJSON = (
  routes: Route[],
): FeatureCollection<LineString> => ({
  type: "FeatureCollection",
  features: routes.map((r) => ({
    type: "Feature",
    id: r.id,
    properties: { name: r.name },
    geometry: { type: "LineString", coordinates: r.coordinates },
  })),
});

export const depotsToGeoJSON = (
  depots: Depot[],
  vehicles: Vehicle[] = [],
): FeatureCollection<GeoPoint> => ({
  type: "FeatureCollection",
  features: depots.map((d) => ({
    type: "Feature",
    id: d.id,
    properties: {
      name: d.name,
      // depotId of an en route vehicle is where it left from, not where it is
      vehicleCount: vehicles.filter(
        (v) => v.depotId === d.id && v.status !== "en_route",
      ).length,
    },
    geometry: { type: "Point", coordinates: [d.lon, d.lat] },
  })),
});

// parked vehicles all share their depot's coordinate, so drawn as-is they would
// stack into one dot. Spread each depot's vehicles evenly on a small ring around it.
export const parkedVehiclesToGeoJSON = (
  vehicles: Vehicle[],
  depots: Depot[],
  ringRadius: number,
): FeatureCollection<GeoPoint> => {
  const depotById = new Map(depots.map((d) => [d.id, d]));
  const byDepot = new Map<number, Vehicle[]>();
  for (const v of vehicles) {
    if (v.status === "en_route") continue; // drawn from the live feed

    byDepot.set(v.depotId, [...(byDepot.get(v.depotId) ?? []), v]);
  }

  const features: Feature<GeoPoint>[] = [];
  for (const [depotId, vehicles] of byDepot) {
    const depot = depotById.get(depotId);
    if (!depot) continue;

    vehicles.forEach((v, i) => {
      const angle = (2 * Math.PI * i) / vehicles.length;
      features.push({
        type: "Feature",
        id: v.id,
        properties: { name: v.name, type: v.type, status: v.status },
        geometry: {
          type: "Point",
          coordinates: offset([depot.lon, depot.lat], ringRadius, angle),
        },
      });
    });
  }
  return { type: "FeatureCollection", features };
};

// vehicles on a trip, at the position streamed by the server
export const liveVehiclesToGeoJSON = (
  vehicles: MovingVehicle[],
): FeatureCollection<GeoPoint> => ({
  type: "FeatureCollection",
  features: vehicles.map((v) => ({
    type: "Feature",
    id: v.vehicleId,
    properties: { degree: v.degree },
    geometry: { type: "Point", coordinates: [v.lng, v.lat] },
  })),
});

// moves a point `meters` in direction `angle` (radians, 0 = east). Accurate enough
// for a few hundred meters, which is all a ring around a depot needs.
//                north
//                  ↑
//                  |   ● destination
//                  |  /
//    meters·sin(θ) | / meters
//                  |/ θ
//     depot ●──────┼──────→ east
//             meters·cos(θ)
//
// inverse of `toLocal` in `geo.go`
// x = dLng × (π/180) × cos(lat) × R -> dLng × METERS_PER_DEGREE × cos(lat)
const offset = ([lng, lat]: Point, meters: number, angle: number): Point => {
  // degree of lat is same (METERS_PER_DEGREE_LAT)
  const dLat = (meters * Math.sin(angle)) / METERS_PER_DEGREE_LAT;
  // degree of lng is different as toward the pole: http://azmicirit.com/length-of-a-degree-of-latitude
  // so need to multiply cos()
  const dLng =
    (meters * Math.cos(angle)) /
    (METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180));
  return [lng + dLng, lat + dLat];
};

export const boundsOf = (
  routes: Route[],
): [southWest: Point, northEast: Point] | null => {
  const points = routes.flatMap((r) => r.coordinates);
  if (points.length === 0) return null;

  const lngs = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
};
