type Point = [lng: number, lat: number];

// Go geo package measures route distances with this radius
const EARTH_RADIUS = 6_371_000;

const rad = (deg: number) => (deg * Math.PI) / 180;

// https://www.movable-type.co.uk/scripts/latlong.html
export const haversine = ([lng1, lat1]: Point, [lng2, lat2]: Point): number => {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const i =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.asin(Math.sqrt(i));
  return EARTH_RADIUS * c;
};

// compass heading from a to b: 0 = north, 90 = east (same as Go geo.Bearing)
// https://www.movable-type.co.uk/scripts/latlong.html
export const bearing = ([lng1, lat1]: Point, [lng2, lat2]: Point): number => {
  const y = Math.sin(rad(lng2 - lng1)) * Math.cos(rad(lat2));
  const x =
    Math.cos(rad(lat1)) * Math.sin(rad(lat2)) -
    Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lng2 - lng1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};

export interface Polyline {
  length: number;
  // position and heading after `distance` meters
  pointAt: (distance: number) => { lng: number; lat: number; degree: number };
}

// twin of Go's geo.Polyline
export const makePolyline = (points: Point[]): Polyline => {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + haversine(points[i - 1], points[i]));
  }
  const length = cum[cum.length - 1];

  const pointAt = (distance: number) => {
    const d = Math.max(0, Math.min(distance, length));

    // lower-bound binary search
    // first i where cums[i] >= d; cums[i-1] <= d <= cums[i]
    let lo = 1;
    let hi = points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1; // Math.floor((lo + hi) / 2)
      if (cum[mid] < d) lo = mid + 1;
      else hi = mid;
    }
    const a = points[lo - 1];
    const b = points[lo];
    const seg = cum[lo] - cum[lo - 1];
    const t = seg > 0 ? (d - cum[lo - 1]) / seg : 0;

    return {
      lng: a[0] + (b[0] - a[0]) * t,
      lat: a[1] + (b[1] - a[1]) * t,
      degree: bearing(a, b),
    };
  };

  return { length, pointAt };
};
