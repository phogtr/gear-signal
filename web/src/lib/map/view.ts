import { METERS_PER_DEGREE_LAT, metersPerPixel } from "./geojson";

import type { MovingVehicle } from "./motion";

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

// desktop: detail card top-left (12 + 288 px), list toggle top, zoom right, legend bottom
// phones: detail card at bottom, above attribution
export const overlayPadding = (isPhone: boolean): Padding =>
  isPhone
    ? { top: 60, right: 56, bottom: 320, left: 24 }
    : { top: 72, right: 64, bottom: 120, left: 320 };

// is a projected point inside part of the map, not covered by overlays
export const isInView = (
  { x, y }: { x: number; y: number },
  width: number,
  height: number,
  pad: Padding,
): boolean =>
  x >= pad.left &&
  x <= width - pad.right &&
  y >= pad.top &&
  y <= height - pad.bottom;

// not redraw when below this
const MIN_MOVE_PX = 0.5;

export const needsRedraw = (
  prev: MovingVehicle[],
  next: MovingVehicle[],
  zoom: number,
): boolean => {
  if (prev.length !== next.length) return true;
  const byId = new Map(prev.map((v) => [v.vehicleId, v]));

  return next.some((n) => {
    const p = byId.get(n.vehicleId);
    if (!p || p.tripId !== n.tripId) return true;

    // rearrange of `offset` (geojson.ts)
    const dx =
      (n.lng - p.lng) *
      Math.cos((n.lat * Math.PI) / 180) *
      METERS_PER_DEGREE_LAT;
    const dy = (n.lat - p.lat) * METERS_PER_DEGREE_LAT;
    return Math.hypot(dx, dy) / metersPerPixel(zoom, n.lat) >= MIN_MOVE_PX;
  });
};
