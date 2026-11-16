import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection } from "geojson";

import { createMap } from "../map/baseMap";

import {
  boundsOfPoints,
  depotsToGeoJSON,
  routesToGeoJSON,
  trackToGeoJSON,
} from "../../lib/map/geojson";
import { themeColor } from "../../lib/theme";

import { INFO_COLOR, WARNING_COLOR } from "../../constants/map";
import type { Depot, Route, TrackPoint } from "../../lib/api/client";

interface Props {
  tripId: number;
  route: Route | undefined;
  depots: Depot[];
  points: TrackPoint[];
}

const fitPadding = (width: number) => ({
  top: 40,
  right: 56, // zoom buttons
  bottom: width < 640 ? 70 : 110, // Tailwind's sm breakpoint
  left: 40,
});

export const ReplayMap = ({ tripId, route, depots, points }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const fittedRef = useRef<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = createMap(containerRef.current);
    map.on("load", () => {
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

const addReplayLayers = (map: MapLibreMap) => {
  map.addSource("route", { type: "geojson", data: empty });
  map.addSource("track", { type: "geojson", data: empty });
  map.addSource("ends", { type: "geojson", data: empty });

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
};
