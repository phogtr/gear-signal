import { useEffect, useRef, useState } from "react";
import {
  AttributionControl,
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection } from "geojson";

import type { Depot, Route, Vehicle } from "../../lib/api/client";
import {
  boundsOf,
  depotsToGeoJSON,
  metersPerPixel,
  parkedVehiclesToGeoJSON,
  routesToGeoJSON,
} from "../../lib/map/geojson";
import { themeColor } from "../../lib/theme";

import "./map-controls.css";

// MapLibre locates its worker relative to its own file, which breaks once Vite
// bundles it. Importing the worker with ?url makes Vite serve/emit it explicitly.
setWorkerUrl(workerUrl);

const STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

const LA: [number, number] = [-118.33, 33.97];

// parked vehicles sit on a ring around their depot. Its radius is fixed in screen
// pixels (recomputed on zoom) so it never smears at city scale or sprawls up close.
const RING_RADIUS_PX = 24;

interface Props {
  depots: Depot[];
  routes: Route[];
  vehicles: Vehicle[];
}

export const CoreMap = ({ depots, routes, vehicles }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const fittedRef = useRef(false);

  // latest data for event handlers registered once at map creation
  const dataRef = useRef({ depots, vehicles });

  // create the map once; MapLibre owns this DOM node from here on
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: STYLE_URL,
      center: LA,
      zoom: 9.5,
      attributionControl: false,
    });
    // credits (OpenFreeMap, OpenMapTiles, OpenStreetMap)
    map.addControl(new AttributionControl({ compact: true }));
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      applyTheme(map);
      addCoreLayers(map);
      setReady(true);
    });
    map.on("zoom", () =>
      syncVehicles(map, dataRef.current.vehicles, dataRef.current.depots),
    );

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // psh data into the map sources whenever it changes
  useEffect(() => {
    dataRef.current = { depots, vehicles };

    const map = mapRef.current;
    if (!map || !ready) return;

    map.getSource<GeoJSONSource>("routes")?.setData(routesToGeoJSON(routes));
    map
      .getSource<GeoJSONSource>("depots")
      ?.setData(depotsToGeoJSON(depots, vehicles));
    syncVehicles(map, vehicles, depots);

    const bounds = boundsOf(routes);
    if (bounds && !fittedRef.current) {
      map.fitBounds(bounds, {
        padding: { top: 48, right: 64, bottom: 72, left: 48 },
        duration: 0,
      });
      fittedRef.current = true;
    }
  }, [ready, depots, routes, vehicles]);

  // MapLibre's unlayered CSS (.maplibregl-map { position: relative }) beats Tailwind's
  // layered utilities, so the positioning lives on a wrapper MapLibre doesn't touch
  return (
    <div className="absolute inset-0">
      <div
        ref={containerRef}
        className="h-full w-full"
        role="region"
        aria-label="Map of Los Angeles"
      />
    </div>
  );
};

/////////////////////////////////////////////////////////////////////////////////
const applyTheme = (map: MapLibreMap) => {
  if (map.getLayer("background")) {
    map.setPaintProperty(
      "background",
      "background-color",
      themeColor("background"),
    );
  }
  if (map.getLayer("water")) {
    map.setPaintProperty("water", "fill-color", themeColor("surface"));
  }
};

const empty: FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

const addCoreLayers = (map: MapLibreMap) => {
  map.addSource("routes", { type: "geojson", data: empty });
  map.addSource("depots", { type: "geojson", data: empty });
  map.addSource("vehicles", { type: "geojson", data: empty });

  map.addLayer({
    id: "routes",
    type: "line",
    source: "routes",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": themeColor("primary"),
      "line-opacity": 0.45,
      "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.5, 14, 4],
    },
  });

  // depots are hollow rings, different from a vehicle dot
  map.addLayer({
    id: "depots",
    type: "circle",
    source: "depots",
    paint: {
      "circle-radius": 7,
      "circle-color": themeColor("background"),
      "circle-stroke-color": themeColor("accent"),
      "circle-stroke-width": 2.5,
    },
  });

  map.addLayer({
    id: "vehicles",
    type: "circle",
    source: "vehicles",
    paint: {
      "circle-radius": 3.5,
      "circle-color": [
        "match",
        ["get", "status"],
        "en_route",
        themeColor("primary"),
        "charging",
        themeColor("success"),
        "maintenance",
        themeColor("accent"),
        themeColor("muted"), // idle
      ],
      "circle-stroke-color": themeColor("background"),
      "circle-stroke-width": 1,
    },
  });

  map.addLayer({
    id: "depot-labels",
    type: "symbol",
    source: "depots",
    layout: {
      "text-field": [
        "format",
        ["get", "name"],
        {},
        "\n",
        {},
        ["concat", ["to-string", ["get", "vehicleCount"]], " vehicles"],
        { "font-scale": 0.85, "text-color": themeColor("muted") },
      ],
      "text-font": ["Noto Sans Regular"],
      "text-size": 12,
      "text-anchor": "top",
      // Below the vehicle ring: ring radius + dot + a small gap, in ems of 12 px text
      "text-offset": [0, (RING_RADIUS_PX + 3.5 + 4) / 12],
    },
    paint: {
      "text-color": themeColor("foreground"),
      "text-halo-color": themeColor("background"),
      "text-halo-width": 1.5,
    },
  });
};

const syncVehicles = (
  map: MapLibreMap,
  vehicles: Vehicle[],
  depots: Depot[],
) => {
  const ringRadius = RING_RADIUS_PX * metersPerPixel(map.getZoom(), LA[1]);
  map
    .getSource<GeoJSONSource>("vehicles")
    ?.setData(parkedVehiclesToGeoJSON(vehicles, depots, ringRadius));
};
