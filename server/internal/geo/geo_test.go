package geo

import (
	"math"
	"testing"
)

// One degree of latitude on a sphere of radius earthRadius.
const metersPerDegree = 2 * math.Pi * earthRadius / 360

func near(t *testing.T, name string, got, want, tol float64) {
	t.Helper()
	if math.Abs(got-want) > tol {
		t.Errorf("%s = %.4f, want %.4f ± %g", name, got, want, tol)
	}
}

func TestDistance(t *testing.T) {
	near(t, "one degree of latitude", Distance(Point{0, 0}, Point{0, 1}), metersPerDegree, 0.01)
	near(t, "same point", Distance(Point{-118.25, 34.04}, Point{-118.25, 34.04}), 0, 0)

	// DTLA Warehouse -> LAX Cargo, straight line ≈ 18.54 km (checked by hand with a flat-plane estimate).
	near(t, "DTLA to LAX", Distance(Point{-118.2468, 34.0407}, Point{-118.4085, 33.9416}), 18537, 5)
}

func TestBearing(t *testing.T) {
	near(t, "north", Bearing(Point{0, 0}, Point{0, 1}), 0, 1e-9)
	near(t, "east", Bearing(Point{0, 0}, Point{1, 0}), 90, 1e-9)
	near(t, "south", Bearing(Point{0, 1}, Point{0, 0}), 180, 1e-9)
	near(t, "west", Bearing(Point{1, 0}, Point{0, 0}), 270, 1e-9)
}

func TestNewPolylineRejectsTooFewPoints(t *testing.T) {
	if _, err := NewPolyline([]Point{{0, 0}}); err == nil {
		t.Fatal("expected error for a single point")
	}
}

func TestPolylinePointAt(t *testing.T) {
	// An L shape at the equator: 1° east, then 1° north.
	pl, err := NewPolyline([]Point{{0, 0}, {1, 0}, {1, 1}})
	if err != nil {
		t.Fatal(err)
	}
	near(t, "length", pl.Length(), 2*metersPerDegree, 0.01)

	tests := []struct {
		name     string
		d        float64
		want     Point
		wantHead float64
	}{
		{"start", 0, Point{0, 0}, 90},
		{"middle of first segment", 0.5 * metersPerDegree, Point{0.5, 0}, 90},
		{"corner", metersPerDegree, Point{1, 0}, 90},
		{"middle of second segment", 1.5 * metersPerDegree, Point{1, 0.5}, 0},
		{"end", 2 * metersPerDegree, Point{1, 1}, 0},
		{"before start clamps", -500, Point{0, 0}, 90},
		{"past end clamps", 1e9, Point{1, 1}, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p, head := pl.PointAt(tt.d)
			near(t, "lng", p.Lng(), tt.want.Lng(), 1e-6)
			near(t, "lat", p.Lat(), tt.want.Lat(), 1e-6)
			near(t, "heading", head, tt.wantHead, 1e-6)
		})
	}
}

func TestApplyDouglasPeucker(t *testing.T) {
	// Straight line with redundant middle points collapses to its endpoints.
	straight := []Point{{0, 0}, {0.001, 0}, {0.002, 0}, {0.003, 0}}
	if got := ApplyDouglasPeucker(straight, 1); len(got) != 2 {
		t.Errorf("straight line kept %d points, want 2", len(got))
	}

	// A 0.001° (~111 m) bump survives a 10 m tolerance but not a 500 m one.
	bump := []Point{{0, 0}, {0.001, 0}, {0.002, 0.001}, {0.003, 0}, {0.004, 0}}
	if got := ApplyDouglasPeucker(bump, 10); !contains(got, Point{0.002, 0.001}) {
		t.Errorf("bump with 10 m tolerance dropped the peak: %v", got)
	}
	if got := ApplyDouglasPeucker(bump, 500); len(got) != 2 {
		t.Errorf("bump with 500 m tolerance kept %d points, want 2", len(got))
	}
}

func contains(points []Point, p Point) bool {
	for _, q := range points {
		if q == p {
			return true
		}
	}
	return false
}
