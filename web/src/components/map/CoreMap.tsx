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

import { useSocketStore } from "../../lib/ws/socket";

import {
  boundsOf,
  depotsToGeoJSON,
  liveVehiclesToGeoJSON,
  metersPerPixel,
  parkedVehiclesToGeoJSON,
  routesToGeoJSON,
} from "../../lib/map/geojson";
import { makeMotion } from "../../lib/map/motion";
import { isInView, overlayPadding } from "../../lib/map/view";
import { makePolyline, type Polyline } from "../../lib/map/polyline";
import { themeColor } from "../../lib/theme";

import type { Depot, Route, Vehicle } from "../../lib/api/client";

import {
  INFO_COLOR,
  MUTED_FOREGROUND_COLOR,
  SUCCESS_COLOR,
  WARNING_COLOR,
} from "../../constants/map";

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
  selectedId: number | null;
  selectedRouteId: number | null;
  onSelect: (id: number | null) => void;
}

// click within this pixels of a vehicle selects it (dots are 7 px)
const HIT_PX = 6;
const NONE = -1;

export const CoreMap = ({
  depots,
  routes,
  vehicles,
  selectedId,
  selectedRouteId,
  onSelect,
}: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const fittedRef = useRef(false);

  // latest data for event handlers registered once at map creation
  const dataRef = useRef({ depots, vehicles });
  const polylinesRef = useRef(new Map<number, Polyline>());
  const onSelectRef = useRef(onSelect);

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
      addTriangleIcon(map);
      addCoreLayers(map);
      setReady(true);
    });

    // click a vehicle selects it, click empty map clears selection
    const vehicleAt = (point: { x: number; y: number }) =>
      map.queryRenderedFeatures(
        [
          [point.x - HIT_PX, point.y - HIT_PX],
          [point.x + HIT_PX, point.y + HIT_PX],
        ],
        { layers: ["live", "vehicles"] },
      )[0];

    map.on("click", (e) => {
      const f = vehicleAt(e.point);
      onSelectRef.current(f ? Number(f.id) : null);
    });
    map.on("mousemove", (e) => {
      map.getCanvas().style.cursor = vehicleAt(e.point) ? "pointer" : "";
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

  useEffect(() => {
    polylinesRef.current = new Map(
      routes.map((r) => [r.id, makePolyline(r.coordinates)]),
    );
  }, [routes]);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // subscribe outside React so a tick
  // updates one map source without re-rendering the page
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const source = map.getSource<GeoJSONSource>("live");
    const motion = makeMotion();
    const isMotion = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let isDrawEmpty = false;

    const draw = () => {
      const isEmpty = motion.size() === 0;
      if (isEmpty && isDrawEmpty) return; // nothing move, skip idle setData call

      isDrawEmpty = isEmpty;
      source?.setData(
        liveVehiclesToGeoJSON(
          motion.positions(performance.now(), polylinesRef.current, isMotion),
        ),
      );
    };

    const loop = () => {
      draw();
      frame = requestAnimationFrame(loop);
    };

    motion.update(useSocketStore.getState().vehicles, performance.now());

    const unsubscribe = useSocketStore.subscribe((s, prev) => {
      if (s.vehicles === prev.vehicles) return;
      motion.update(s.vehicles, performance.now());
      if (!isMotion) draw();
    });

    if (isMotion) loop();
    else draw();

    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
    };
  }, [ready]);

  // highlight selection
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    map.setFilter("route-selected", ["==", ["id"], selectedRouteId ?? NONE]);
    map.setFilter("vehicle-selected", ["==", ["id"], selectedId ?? NONE]);
    map.setFilter("live-selected", ["==", ["id"], selectedId ?? NONE]);
  }, [ready, selectedId, selectedRouteId]);

  // pan into selected vehicle but only if it's off-screen or under an overlay
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || selectedId === null) return;

    const live = useSocketStore
      .getState()
      .vehicles.find((v) => v.vehicleId === selectedId);
    const parked = dataRef.current.vehicles.find((v) => v.id === selectedId);
    const depot = dataRef.current.depots.find((d) => d.id === parked?.depotId);
    const target: [number, number] | undefined = live
      ? [live.lng, live.lat]
      : depot && [depot.lon, depot.lat];

    if (!target) return;

    const { clientWidth: width, clientHeight: height } = map.getContainer();
    const padding = overlayPadding(width < 640); // Tailwind's sm breakpoint

    if (isInView(map.project(target), width, height, padding)) return;

    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.easeTo({ center: target, padding, duration: reduce ? 0 : 600 });
  }, [ready, selectedId]);

  // push data into the map sources whenever it changes
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
    map.setPaintProperty("water", "fill-color", themeColor("muted"));
  }
};

const TRIANGLE_PX = 18;

const addTriangleIcon = (map: MapLibreMap) => {
  const ratio = 2;
  const size = TRIANGLE_PX * ratio;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return;
  ctx.canvas.width = ctx.canvas.height = size;

  const inset = 3 * ratio;
  ctx.beginPath();
  ctx.moveTo(size / 2, inset); // (18, 6) top tip
  ctx.lineTo(size - inset - 2 * ratio, size - inset); // (26, 30) bottom right
  ctx.lineTo(inset + 2 * ratio, size - inset); // (10, 30) bottom left
  ctx.closePath(); // back to (18, 6)
  ctx.lineJoin = "round";

  ctx.strokeStyle = themeColor("background");
  ctx.lineWidth = 4.5 * ratio;
  ctx.stroke();
  ctx.strokeStyle = themeColor(INFO_COLOR);
  ctx.lineWidth = 2 * ratio;
  ctx.stroke();

  map.addImage("vehicle-triangle", ctx.getImageData(0, 0, size, size), {
    pixelRatio: ratio,
  });
};

const empty: FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

const addCoreLayers = (map: MapLibreMap) => {
  map.addSource("routes", { type: "geojson", data: empty });
  map.addSource("depots", { type: "geojson", data: empty });
  map.addSource("vehicles", { type: "geojson", data: empty });
  map.addSource("live", { type: "geojson", data: empty });

  map.addLayer({
    id: "routes",
    type: "line",
    source: "routes",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": themeColor(INFO_COLOR),
      "line-opacity": 0.3,
      "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.5, 14, 4],
    },
  });

  // selected vehicle's route
  map.addLayer({
    id: "route-selected",
    type: "line",
    source: "routes",
    filter: ["==", ["id"], NONE],
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": themeColor(INFO_COLOR),
      "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2.5, 14, 6],
    },
  });

  // depots are hollow rings
  map.addLayer({
    id: "depots",
    type: "circle",
    source: "depots",
    paint: {
      "circle-radius": 7,
      "circle-color": themeColor("background"),
      "circle-stroke-color": themeColor(WARNING_COLOR),
      "circle-stroke-width": 2.5,
    },
  });

  // parked vehicles
  map.addLayer({
    id: "vehicles",
    type: "circle",
    source: "vehicles",
    paint: {
      "circle-radius": 3.5,
      "circle-color": [
        "match",
        ["get", "status"],
        "charging",
        themeColor(SUCCESS_COLOR),
        "maintenance",
        themeColor(WARNING_COLOR),
        themeColor(MUTED_FOREGROUND_COLOR), // idle
      ],
      "circle-opacity": ["match", ["get", "status"], "idle", 0.6, 1],
      "circle-stroke-color": themeColor("background"),
      "circle-stroke-width": 1,
    },
  });

  // ring around selected vehicle, parked/moving
  const selectedRing = {
    type: "circle" as const,
    filter: ["==", ["id"], NONE] as ["==", ["id"], number],
    paint: {
      "circle-color": "rgba(0, 0, 0, 0)",
      "circle-stroke-color": themeColor("foreground"),
      "circle-stroke-width": 2,
    },
  };
  map.addLayer({
    ...selectedRing,
    id: "vehicle-selected",
    source: "vehicles",
    paint: { ...selectedRing.paint, "circle-radius": 8 },
  });
  map.addLayer({
    ...selectedRing,
    id: "live-selected",
    source: "live",
    paint: { ...selectedRing.paint, "circle-radius": 13 },
  });

  // vehicles on a trip, hollow triangles
  map.addLayer({
    id: "live",
    type: "symbol",
    source: "live",
    layout: {
      "icon-image": "vehicle-triangle",
      "icon-rotate": ["get", "degree"],
      // heading is a compass bearing, rotate with the map, not the screen
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
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
        { "font-scale": 0.85, "text-color": themeColor("muted-foreground") },
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
