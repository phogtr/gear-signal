import {
  AttributionControl,
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";

import { themeColor } from "../../lib/theme";
import { INFO_COLOR } from "../../constants/map";

import "./map-controls.css";

// MapLibre locate its worker relative to its own file, which break once Vite
// bundles it. Importing worker with ?url makes Vite serve/emit it explicitly
setWorkerUrl(workerUrl);

const STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

export const LA: [number, number] = [-118.33, 33.97];

export const createMap = (
  container: HTMLElement,
  { hasZoomControl = true } = {},
): MapLibreMap => {
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
  if (hasZoomControl) {
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
  }
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

const TRIANGLE_PX = 18;

export const addTriangleIcon = (map: MapLibreMap) => {
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
