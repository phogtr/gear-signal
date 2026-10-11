package geo

import (
	"errors"
	"math"
	"sort"
)

const earthRadius = 6371000.0

// Point is a [lng, lat] pair in degrees, same order as GeoJSON and OSRM.
type Point [2]float64

func (p Point) Lng() float64 { return p[0] }
func (p Point) Lat() float64 { return p[1] }

func rad(deg float64) float64 { return deg * math.Pi / 180 }

// returns the great-circle distance in meters (haversine formula).
// https://www.movable-type.co.uk/scripts/latlong.html
func Distance(a, b Point) float64 {
	dLat := rad(b.Lat() - a.Lat())
	dLng := rad(b.Lng() - a.Lng())

	i := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(rad(a.Lat()))*math.Cos(rad(b.Lat()))*math.Sin(dLng/2)*math.Sin(dLng/2)
	c := 2 * math.Asin(math.Sqrt(i))

	return earthRadius * c
}

// returns the compass heading from a to b in degrees: 0 = north, 90 = east.
// https://www.movable-type.co.uk/scripts/latlong.html
func Bearing(a, b Point) float64 {
	lat1, lat2 := rad(a.Lat()), rad(b.Lat())
	dLng := rad(b.Lng() - a.Lng())

	y := math.Sin(dLng) * math.Cos(lat2)
	x := math.Cos(lat1)*math.Sin(lat2) - math.Sin(lat1)*math.Cos(lat2)*math.Cos(dLng)
	deg := math.Atan2(y, x)
	return math.Mod(deg*180/math.Pi+360, 360)
}

// Polyline is a route geometry with precomputed distances, so a position can be
// looked up by "meters traveled from the start".
type Polyline struct {
	points []Point
	cum    []float64 // cum[i] = meters from points[0] to points[i]
}

func NewPolyline(points []Point) (*Polyline, error) {
	if len(points) < 2 {
		return nil, errors.New("polyline needs at least 2 points")
	}
	cum := make([]float64, len(points))
	for i := 1; i < len(points); i++ {
		cum[i] = cum[i-1] + Distance(points[i-1], points[i])
	}
	return &Polyline{points: points, cum: cum}, nil
}

func (pl *Polyline) Length() float64 { return pl.cum[len(pl.cum)-1] }

// returns the position and heading after traveling d meters along the line.
// e.g: cum = [0, 400, 1000, 1500], d = 700.
// SearchFloat64s return i = 2.
// seg = cum[2] - cum[1] = 1000 - 400 = 600.
// d - cum[i-1] = 700 - 400 = 300.
// t = 300 / 600 = 0.5
func (pl *Polyline) PointAt(d float64) (Point, float64) {
	d = math.Max(0, math.Min(d, pl.Length()))

	// i is the end of the segment containing d: cum[i-1] <= d <= cum[i].
	i := sort.SearchFloat64s(pl.cum, d)
	if i == 0 {
		i = 1
	}
	a, b := pl.points[i-1], pl.points[i]
	seg := pl.cum[i] - pl.cum[i-1]

	// fraction from 0 to 1. 0 means "at a", 1 means "at b",
	t := 0.0
	if seg > 0 {
		// d - [i-1] is is how far into this segment, measured from its start
		t = (d - pl.cum[i-1]) / seg
	}
	// p is linear interpolation (lerp function)
	// p = a * (1-t) + b*t -> a - a*t + b*t -> a + b*t - a*t
	// p = a + (b − a) * t
	p := Point{a.Lng() + (b.Lng()-a.Lng())*t, a.Lat() + (b.Lat()-a.Lat())*t}
	return p, Bearing(a, b)
}

// removes points that deviate less than tolerance meters from the
// overall shape (Douglas–Peucker). First and last points are always kept.
func ApplyDouglasPeucker(points []Point, tolerance float64) []Point {
	if len(points) < 3 {
		return points
	}

	keep := make([]bool, len(points))
	keep[0], keep[len(points)-1] = true, true
	douglasPeucker(points, 0, len(points)-1, tolerance, keep)

	out := make([]Point, 0, len(points))
	for i, k := range keep {
		if k {
			out = append(out, points[i])
		}
	}
	return out
}

func douglasPeucker(points []Point, first, last int, tol float64, keep []bool) {
	maxDist, index := 0.0, -1
	for i := first + 1; i < last; i++ {
		if d := distanceToSegment(points[i], points[first], points[last]); d > maxDist {
			maxDist, index = d, i
		}
	}
	if index != -1 && maxDist > tol {
		keep[index] = true
		douglasPeucker(points, first, index, tol, keep)
		douglasPeucker(points, index, last, tol, keep)
	}
}

// projects onto a flat plane in meters around p. At city scale
// the error is negligible and the math stays simple.
func distanceToSegment(p, a, b Point) float64 {
	ax, ay := toLocal(p, a)
	bx, by := toLocal(p, b)
	dx, dy := bx-ax, by-ay // d = vector from a to b

	// any point on the line = a + t*d (parametric equation of a line).
	// Drops a perpendicular from p onto the infinite line through a & b, and t says where it lands.
	// t = 0 → A, t = 1 → B, t = 0.5 → midpoint
	t := 0.0
	if lenSq := dx*dx + dy*dy; lenSq > 0 {
		// dot product: (a + t*d) · d = 0 (perpendicular)
		// expand: a·d + t(d·d) = 0
		// t = -(a·d) / d·d
		// t = -(ax*dx + ay*dy) / (dx*dx + dy*dy)
		// https://youtu.be/LyGKycYT2v0?si=fNRhS0e5ELxNK7PT
		t = math.Max(0, math.Min(1, -(ax*dx+ay*dy)/lenSq))
	}
	return math.Hypot(ax+t*dx, ay+t*dy)
}

// converts q to x,y meters relative to origin (equirectangular projection).
// Result is the east/north distance in meters.
// p as origin, q convert to 2d x,y distance
// https://en.wikipedia.org/wiki/Equirectangular_projection#Forward
func toLocal(origin, q Point) (float64, float64) {
	x := rad(q.Lng()-origin.Lng()) * math.Cos(rad(origin.Lat())) * earthRadius
	y := rad(q.Lat()-origin.Lat()) * earthRadius
	return x, y
}
