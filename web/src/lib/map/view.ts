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
