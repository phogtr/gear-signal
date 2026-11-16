import { describe, expect, it } from "vitest";

import {
  boundsOfPoints,
  depotsToGeoJSON,
  liveVehiclesToGeoJSON,
  metersPerPixel,
  parkedVehiclesToGeoJSON,
  routesToGeoJSON,
  trackToGeoJSON,
} from "../../../lib/map/geojson";
import type {
  Depot,
  Route,
  TrackPoint,
  Vehicle,
} from "../../../lib/api/client";
import type { ActiveAlert } from "../../../lib/events";

const depot = (id: number, lon: number, lat: number): Depot => ({
  id,
  name: `Depot ${id}`,
  lon,
  lat,
});

const vehicle = (
  id: number,
  depotId: number,
  status: Vehicle["status"] = "idle",
): Vehicle => ({
  id,
  name: `VAN-${id}`,
  plate: `PLATE${id}`,
  type: "ev_van",
  status,
  depotId,
  res: 0.8,
});

const route = (id: number, coordinates: [number, number][]): Route => ({
  id,
  name: `Route ${id}`,
  originDepotId: 1,
  destinationDepotId: 2,
  distance: 0,
  duration: 0,
  coordinates,
});

// great-circle distance on the Web Mercator sphere, independent of the code under test
const haversine = ([lng1, lat1]: number[], [lng2, lat2]: number[]): number => {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) *
      Math.cos(rad(lat2)) *
      Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * 6_378_137 * Math.asin(Math.sqrt(a));
};

const DTLA = depot(1, -118.24, 34.05);

describe("metersPerPixel", () => {
  it("covers the whole equator with one 512 px tile at zoom 0", () => {
    expect(metersPerPixel(0, 0) * 512).toBeCloseTo(40_075_016.686, 3);
  });

  it("halves with every zoom level", () => {
    expect(metersPerPixel(13, 34)).toBeCloseTo(metersPerPixel(12, 34) / 2, 9);
  });

  it("shrinks with cos(latitude)", () => {
    expect(metersPerPixel(10, 60)).toBeCloseTo(metersPerPixel(10, 0) / 2, 9);
  });

  it("is about 15.8 m at zoom 12 over Los Angeles", () => {
    // 78,271.5 m × cos(34.05°) / 2^12 = 64,853 m / 4,096
    expect(metersPerPixel(12, 34.05)).toBeCloseTo(15.833, 3);
  });
});

describe("routesToGeoJSON", () => {
  it("makes one LineString per route with its id and name", () => {
    const coords: [number, number][] = [
      [-118.24, 34.05],
      [-118.4, 33.94],
    ];
    const fc = routesToGeoJSON([route(7, coords)]);

    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]).toEqual({
      type: "Feature",
      id: 7,
      properties: { name: "Route 7" },
      geometry: { type: "LineString", coordinates: coords },
    });
  });
});

describe("depotsToGeoJSON", () => {
  it("puts depots at [lon, lat] and counts the vehicles parked there", () => {
    const fc = depotsToGeoJSON(
      [DTLA, depot(2, -118.4, 33.94)],
      [vehicle(1, 1), vehicle(2, 1), vehicle(3, 2)],
    );

    expect(fc.features.map((f) => f.geometry.coordinates)).toEqual([
      [-118.24, 34.05],
      [-118.4, 33.94],
    ]);
    expect(fc.features.map((f) => f.properties?.vehicleCount)).toEqual([2, 1]);
  });

  it("does not count en route vehicles at the depot they left", () => {
    const fc = depotsToGeoJSON(
      [DTLA],
      [vehicle(1, 1), vehicle(2, 1, "en_route")],
    );
    expect(fc.features[0].properties?.vehicleCount).toBe(1);
  });

  it("counts zero when vehicles are not passed", () => {
    expect(depotsToGeoJSON([DTLA]).features[0].properties?.vehicleCount).toBe(
      0,
    );
  });
});

describe("parkedVehiclesToGeoJSON", () => {
  const ring = 100;

  it("places every vehicle ringRadius meters from its depot", () => {
    const vehicles = Array.from({ length: 10 }, (_, i) => vehicle(i + 1, 1));
    const fc = parkedVehiclesToGeoJSON(vehicles, [DTLA], ring);

    expect(fc.features).toHaveLength(10);
    for (const f of fc.features) {
      // 111,320 m/degree vs 111,319.49 from the sphere: ~0.5 mm off at 100 m
      expect(
        haversine([DTLA.lon, DTLA.lat], f.geometry.coordinates),
      ).toBeCloseTo(ring, 2);
    }
  });

  it("spreads vehicles evenly, starting east and going counterclockwise", () => {
    const vehicles = [1, 2, 3, 4].map((id) => vehicle(id, 1));
    const [east, north, west, south] = parkedVehiclesToGeoJSON(
      vehicles,
      [DTLA],
      ring,
    ).features.map((f) => f.geometry.coordinates);

    expect(east[0]).toBeGreaterThan(DTLA.lon);
    expect(east[1]).toBeCloseTo(DTLA.lat, 9);
    expect(north[0]).toBeCloseTo(DTLA.lon, 9);
    expect(north[1]).toBeGreaterThan(DTLA.lat);
    expect(west[0]).toBeLessThan(DTLA.lon);
    expect(south[1]).toBeLessThan(DTLA.lat);
  });

  it("needs a bigger longitude step than latitude step for the same meters", () => {
    // a degree of longitude is shorter by cos(34.05°) ≈ 0.83
    const [east, north] = parkedVehiclesToGeoJSON(
      [vehicle(1, 1), vehicle(2, 1), vehicle(3, 1), vehicle(4, 1)],
      [DTLA],
      ring,
    ).features.map((f) => f.geometry.coordinates);

    const dLng = east[0] - DTLA.lon;
    const dLat = north[1] - DTLA.lat;
    expect(dLat / dLng).toBeCloseTo(Math.cos((DTLA.lat * Math.PI) / 180), 9);
  });

  it("keeps id, name, type and status for styling", () => {
    const [f] = parkedVehiclesToGeoJSON(
      [vehicle(5, 1, "charging")],
      [DTLA],
      ring,
    ).features;

    expect(f.id).toBe(5);
    expect(f.properties).toEqual({
      name: "VAN-5",
      type: "ev_van",
      status: "charging",
    });
  });

  it("leaves en route vehicles off the ring", () => {
    const fc = parkedVehiclesToGeoJSON(
      [vehicle(1, 1), vehicle(2, 1, "en_route")],
      [DTLA],
      ring,
    );
    expect(fc.features.map((f) => f.id)).toEqual([1]);
  });

  it("skips vehicles whose depot is unknown", () => {
    const fc = parkedVehiclesToGeoJSON(
      [vehicle(1, 1), vehicle(2, 99)],
      [DTLA],
      ring,
    );
    expect(fc.features.map((f) => f.id)).toEqual([1]);
  });
});

describe("liveVehiclesToGeoJSON", () => {
  const moving = {
    vehicleId: 7,
    tripId: 70,
    lng: -118.3,
    lat: 34.01,
    degree: 45,
  };

  it("places each vehicle at its position with its heading", () => {
    const [f] = liveVehiclesToGeoJSON([moving], new Map()).features;
    expect(f.id).toBe(7);
    expect(f.geometry.coordinates).toEqual([-118.3, 34.01]);
    expect(f.properties).toEqual({ degree: 45 });
  });

  it("adds the worst raised severity of the vehicle's trip", () => {
    const alerts = new Map<number, ActiveAlert[]>([
      [
        70,
        [
          { code: "OVERHEAT", severity: "critical", message: "a" },
          { code: "SPEEDING", severity: "warning", message: "b" },
        ],
      ],
      [99, [{ code: "SPEEDING", severity: "warning", message: "c" }]],
    ]);
    const [f, other] = liveVehiclesToGeoJSON(
      [moving, { ...moving, vehicleId: 8, tripId: 80 }],
      alerts,
    ).features;
    expect(f.properties).toEqual({ degree: 45, severity: "critical" });
    expect(other.properties).toEqual({ degree: 45 });
  });
});

describe("boundsOfPoints", () => {
  it("returns the southwest and northeast corners of all points", () => {
    expect(
      boundsOfPoints([
        [-118.24, 34.05],
        [-118.4, 33.94],
        [-118.15, 34.18],
      ]),
    ).toEqual([
      [-118.4, 33.94],
      [-118.15, 34.18],
    ]);
  });

  it("returns null without points", () => {
    expect(boundsOfPoints([])).toBeNull();
  });
});

describe("trackToGeoJSON", () => {
  const T0 = Date.parse("2026-11-14T17:00:00Z");
  const point = (s: number): TrackPoint => ({
    ts: new Date(T0 + s * 1000).toISOString(),
    lng: -118.25 + s / 1000,
    lat: 34.05,
    degree: 90,
    speed: 15,
  });
  const pieces = (seconds: number[]) =>
    trackToGeoJSON(seconds.map(point)).geometry.coordinates;

  it("draws one line at a point a second", () => {
    expect(pieces([0, 1, 2])).toEqual([
      [
        [-118.25, 34.05],
        [-118.249, 34.05],
        [-118.248, 34.05],
      ],
    ]);
  });

  it("breaks the line at a gap instead of bridging it", () => {
    const lines = pieces([0, 1, 2, 30, 31]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveLength(3);
    expect(lines[1]).toEqual([
      [-118.22, 34.05],
      [-118.219, 34.05],
    ]);
  });

  it("drops a lone point between gaps, it has no line", () => {
    expect(pieces([0, 1, 10, 20, 21]).map((l) => l.length)).toEqual([2, 2]);
    expect(pieces([40])).toEqual([]);
    expect(pieces([])).toEqual([]);
  });
});
