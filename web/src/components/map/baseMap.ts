import {
  AttributionControl,
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";

import { themeColor } from "../../lib/theme";

import "./map-controls.css";

// MapLibre locate its worker relative to its own file, which break once Vite
// bundles it. Importing worker with ?url makes Vite serve/emit it explicitly
setWorkerUrl(workerUrl);

const STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

export const LA: [number, number] = [-118.33, 33.97];

export const createMap = (container: HTMLElement): MapLibreMap => {
  const map = new MapLibreMap({
    container,
    style: STYLE_URL,
    center: LA,
    zoom: 9.5,
    attributionControl: false,
    fadeDuration: 0, // default 300ms
  });
  // credits (OpenFreeMap, OpenMapTiles, OpenStreetMap)
  map.addControl(new AttributionControl({ compact: true }));
  map.addControl(new NavigationControl({ showCompass: false }), "top-right");
  map.on("load", () => applyTheme(map));
  return map;
};

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
