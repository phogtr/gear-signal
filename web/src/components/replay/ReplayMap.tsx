import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection } from "geojson";

import { addTriangleIcon, createMap } from "../map/baseMap";

import {
  boundsOfPoints,
  depotsToGeoJSON,
  routesToGeoJSON,
  trackToGeoJSON,
} from "../../lib/map/geojson";
import { themeColor } from "../../lib/theme";

import { INFO_COLOR, WARNING_COLOR } from "../../constants/map";
import type { Playback } from "../../lib/playback";
import type { Track, TrackPosition } from "../../lib/replay";
import type { Depot, Route, TrackPoint } from "../../lib/api/client";

interface Props {
  tripId: number;
  route: Route | undefined;
  depots: Depot[];
  points: TrackPoint[];
  track: Track;
  playback: Playback;
  start: number;
}

const fitPadding = (width: number) => ({
  top: 40,
  right: 56, // zoom buttons
  bottom: width < 640 ? 70 : 110, // Tailwind's sm breakpoint
  left: 40,
});

export const ReplayMap = ({
  tripId,
  route,
  depots,
  points,
  track,
  playback,
  start,
}: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const fittedRef = useRef<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = createMap(containerRef.current);
    map.on("load", () => {
      addTriangleIcon(map);
      addReplayLayers(map);
      setReady(true);
    });
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    map
      .getSource<GeoJSONSource>("route")
      ?.setData(routesToGeoJSON(route ? [route] : []));
    map.getSource<GeoJSONSource>("track")?.setData(trackToGeoJSON(points));
    map.getSource<GeoJSONSource>("ends")?.setData(depotsToGeoJSON(depots));

    if (fittedRef.current === tripId) return;
    const bounds = boundsOfPoints([
      ...(route?.coordinates ?? []),
      ...points.map((p): [number, number] => [p.lng, p.lat]),
    ]);
    if (!bounds) return;
    map.fitBounds(bounds, {
      padding: fitPadding(map.getContainer().clientWidth),
      duration: 0,
    });
    fittedRef.current = tripId;
  }, [ready, tripId, route, depots, points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const source = map.getSource<GeoJSONSource>("vehicle");
    const isMotion = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    let drawn: TrackPosition | null | undefined;

    const draw = (elapsed: number) => {
      const p = track.at(start + elapsed, isMotion);
      const isSame =
        p === drawn ||
        (p &&
          drawn &&
          p.lng === drawn.lng &&
          p.lat === drawn.lat &&
          p.degree === drawn.degree);
      if (isSame) return;
      drawn = p;
      source?.setData(p ? vehicleFeature(p) : empty);
    };

    draw(playback.get().elapsed);

    return playback.subscribe((s) => draw(s.elapsed));
  }, [ready, track, playback, start]);

  return (
    <div className="absolute inset-0">
      <div
        ref={containerRef}
        className="h-full w-full"
        role="region"
        aria-label="Map of the trip"
      />
    </div>
  );
};

const empty: FeatureCollection = { type: "FeatureCollection", features: [] };

const vehicleFeature = (p: TrackPosition): FeatureCollection => ({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { degree: p.degree },
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
    },
  ],
});

const addReplayLayers = (map: MapLibreMap) => {
  map.addSource("route", { type: "geojson", data: empty });
  map.addSource("track", { type: "geojson", data: empty });
  map.addSource("ends", { type: "geojson", data: empty });
  map.addSource("vehicle", { type: "geojson", data: empty });

  map.addLayer({
    id: "route",
    type: "line",
    source: "route",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": themeColor(INFO_COLOR),
      "line-opacity": 0.3,
      "line-width": ["interpolate", ["linear"], ["zoom"], 9, 4, 14, 10],
    },
  });

  map.addLayer({
    id: "track",
    type: "line",
    source: "track",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": themeColor(INFO_COLOR),
      "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.5, 14, 3],
    },
  });

  map.addLayer({
    id: "ends",
    type: "circle",
    source: "ends",
    paint: {
      "circle-radius": 7,
      "circle-color": themeColor("background"),
      "circle-stroke-color": themeColor(WARNING_COLOR),
      "circle-stroke-width": 2.5,
    },
  });

  map.addLayer({
    id: "end-labels",
    type: "symbol",
    source: "ends",
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 12,
      "text-anchor": "top",
      "text-offset": [0, 1],
    },
    paint: {
      "text-color": themeColor("foreground"),
      "text-halo-color": themeColor("background"),
      "text-halo-width": 1.5,
    },
  });

  map.addLayer({
    id: "vehicle",
    type: "symbol",
    source: "vehicle",
    layout: {
      "icon-image": "vehicle-triangle",
      "icon-rotate": ["get", "degree"],
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });
};
