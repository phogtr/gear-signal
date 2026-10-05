// routefixtures turns fixtures/routes.yaml (depots + via waypoints) into
// street-following route fixtures using OSRM routing API. Dev-only: run it once & commit generated files.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"time"

	"gopkg.in/yaml.v3"

	"github.com/phogtr/gear-signal/internal/geo"
)

type depot struct {
	Name string  `json:"name"`
	Lat  float64 `json:"lat"`
	Lon  float64 `json:"lon"`
}

type routeSpec struct {
	Name string      `yaml:"name"`
	From string      `yaml:"from"`
	To   string      `yaml:"to"`
	Via  []geo.Point `yaml:"via"`
}

type routeFixture struct {
	Name        string      `json:"name"`
	From        string      `json:"from"`
	To          string      `json:"to"`
	DistanceM   int         `json:"distance_m"`
	DurationS   int         `json:"duration_s"`
	Coordinates []geo.Point `json:"coordinates"`
}

// rough bounding box of the LA basin
var laBounds = struct{ minLng, maxLng, minLat, maxLat float64 }{-118.95, -117.65, 33.6, 34.45}

const (
	minDistance    = 2_000
	maxDistance    = 80_000
	tolerance      = 3
	maxSnap        = 150
	uTurnThreshold = 170 // degrees of heading change at a single vertex
)

func main() {
	dir := flag.String("dir", "fixtures", "fixtures directory containing depots.json and routes.yaml")
	osrmURL := flag.String("osrm", "https://router.project-osrm.org", "OSRM base URL")
	only := flag.String("only", "", "regenerate a single route by name")
	flag.Parse()

	if err := run(*dir, *osrmURL, *only); err != nil {
		slog.Error("routefixtures failed", "err", err)
		os.Exit(1)
	}
}

func run(dir, osrmURL, only string) error {
	depots, err := loadDepots(filepath.Join(dir, "depots.json"))
	if err != nil {
		return err
	}
	specs, err := loadSpecs(filepath.Join(dir, "routes.yaml"))
	if err != nil {
		return err
	}

	client := &osrmClient{baseURL: osrmURL, http: &http.Client{Timeout: 30 * time.Second}}
	ctx := context.Background()
	outDir := filepath.Join(dir, "routes")
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return err
	}

	var fixtures []routeFixture
	for i, spec := range specs {
		if only != "" && spec.Name != only {
			continue
		}
		if i > 0 && only == "" {
			time.Sleep(time.Second)
		}

		fx, err := build(ctx, client, depots, spec)
		if err != nil {
			return fmt.Errorf("route %q: %w", spec.Name, err)
		}
		if err := writeJSON(filepath.Join(outDir, spec.Name+".json"), fx); err != nil {
			return err
		}
		fixtures = append(fixtures, fx)
	}

	if only == "" {
		return writeJSON(filepath.Join(dir, "routes.geojson"), toGeoJSON(depots, fixtures))
	}
	return nil
}

func build(ctx context.Context, client *osrmClient, depots map[string]depot, spec routeSpec) (routeFixture, error) {
	from, ok := depots[spec.From]
	if !ok {
		return routeFixture{}, fmt.Errorf("unknown depot %q", spec.From)
	}
	to, ok := depots[spec.To]
	if !ok {
		return routeFixture{}, fmt.Errorf("unknown depot %q", spec.To)
	}

	points := append([]geo.Point{{from.Lon, from.Lat}}, spec.Via...)
	points = append(points, geo.Point{to.Lon, to.Lat})

	resp, err := client.route(ctx, points)
	if err != nil {
		return routeFixture{}, err
	}

	for i, wp := range resp.Waypoints {
		if wp.Distance > maxSnap {
			return routeFixture{}, fmt.Errorf("waypoint %d snapped %.0f m to %q", i, wp.Distance, wp.Name)
		}
	}

	route := resp.Routes[0]
	if err := validate(route.Geometry.Coordinates); err != nil {
		return routeFixture{}, err
	}

	coords := geo.ApplyDouglasPeucker(route.Geometry.Coordinates, tolerance)
	for i := range coords {
		coords[i] = geo.Point{round5(coords[i].Lng()), round5(coords[i].Lat())}
	}

	pl, err := geo.NewPolyline(coords)
	if err != nil {
		return routeFixture{}, err
	}
	if l := pl.Length(); l < minDistance || l > maxDistance {
		return routeFixture{}, fmt.Errorf("length %.0f m outside %d–%d m", l, minDistance, maxDistance)
	}

	slog.Info("route ok",
		"name", spec.Name,
		"km", fmt.Sprintf("%.1f", pl.Length()/1000),
		"min", fmt.Sprintf("%.0f", route.Duration/60),
		"points", fmt.Sprintf("%d→%d", len(route.Geometry.Coordinates), len(coords)))

	// distance_m is measured on the stored polyline (not OSRM's figure) so that
	// progress along the line and the total length always agree.
	return routeFixture{
		Name:        spec.Name,
		From:        spec.From,
		To:          spec.To,
		DistanceM:   int(math.Round(pl.Length())),
		DurationS:   int(math.Round(route.Duration)),
		Coordinates: coords,
	}, nil
}

// rejects geometry that leaves LA or doubles back on itself, which
// usually means a via waypoint forced a detour onto the wrong side of a road.
func validate(coords []geo.Point) error {
	if len(coords) < 2 {
		return errors.New("geometry has fewer than 2 points")
	}

	for _, p := range coords {
		if p.Lng() < laBounds.minLng || p.Lng() > laBounds.maxLng || p.Lat() < laBounds.minLat || p.Lat() > laBounds.maxLat {
			return fmt.Errorf("point %v is outside the LA bounding", p)
		}
	}

	for i := 1; i < len(coords)-1; i++ {
		in := geo.Bearing(coords[i-1], coords[i])
		out := geo.Bearing(coords[i], coords[i+1])
		change := math.Abs(math.Mod(out-in+540, 360) - 180) // 0 = straight on, 180 = full reversal
		if change >= uTurnThreshold {
			return fmt.Errorf("U-turn at %v", coords[i])
		}
	}
	return nil
}

func round5(v float64) float64 { return math.Round(v*1e5) / 1e5 }

func loadDepots(path string) (map[string]depot, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var depots []depot
	if err := json.Unmarshal(data, &depots); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	byName := make(map[string]depot, len(depots))
	for _, d := range depots {
		byName[d.Name] = d
	}
	return byName, nil
}

func loadSpecs(path string) ([]routeSpec, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var specs []routeSpec
	if err := yaml.Unmarshal(data, &specs); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	return specs, nil
}

// matches a [lng, lat] pair that MarshalIndent spread over four lines.
var pairPattern = regexp.MustCompile(`\[\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]`)

// writes indented JSON with formatting so that git diffs is readable.
func writeJSON(path string, v any) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	data = pairPattern.ReplaceAll(data, []byte("[$1, $2]"))
	return os.WriteFile(path, append(data, '\n'), 0o644)
}

// builds a GeoJSON FeatureCollection of every route and depot.
// Paste to geojson.io.
func toGeoJSON(depots map[string]depot, fixtures []routeFixture) map[string]any {
	features := make([]map[string]any, 0, len(fixtures)+len(depots))
	for _, fx := range fixtures {
		features = append(features, map[string]any{
			"type":       "Feature",
			"properties": map[string]any{"name": fx.Name, "km": math.Round(float64(fx.DistanceM)/100) / 10},
			"geometry":   map[string]any{"type": "LineString", "coordinates": fx.Coordinates},
		})
	}

	names := make([]string, 0, len(depots))
	for name := range depots {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		d := depots[name]
		features = append(features, map[string]any{
			"type":       "Feature",
			"properties": map[string]any{"name": d.Name, "marker-color": "#f59e0b"},
			"geometry":   map[string]any{"type": "Point", "coordinates": geo.Point{d.Lon, d.Lat}},
		})
	}
	return map[string]any{"type": "FeatureCollection", "features": features}
}
