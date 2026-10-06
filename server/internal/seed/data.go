package seed

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"math/rand/v2"
	"path"

	"github.com/phogtr/gear-signal/internal/geo"
)

type Depot struct {
	Name string  `json:"name"`
	Lat  float64 `json:"lat"`
	Lon  float64 `json:"lon"`
}

type Route struct {
	Name        string      `json:"name"`
	From        string      `json:"from"`
	To          string      `json:"to"`
	DistanceM   float64     `json:"distance_m"`
	DurationS   int         `json:"duration_s"`
	Coordinates []geo.Point `json:"coordinates"`
}

type Vehicle struct {
	Name   string
	Plate  string
	Type   string
	Status string
	Depot  string
}

// reads depots.json and routes/*.json from fsys and checks that every
// route starts and ends at a known depot.
func Load(fsys fs.FS) ([]Depot, []Route, error) {
	var depots []Depot
	if err := readJSON(fsys, "depots.json", &depots); err != nil {
		return nil, nil, err
	}
	known := make(map[string]bool, len(depots))
	for _, d := range depots {
		known[d.Name] = true
	}

	files, err := fs.Glob(fsys, "routes/*.json")
	if err != nil {
		return nil, nil, err
	}
	routes := make([]Route, len(files))
	for i, f := range files {
		if err := readJSON(fsys, f, &routes[i]); err != nil {
			return nil, nil, err
		}

		r := routes[i]
		if !known[r.From] || !known[r.To] {
			return nil, nil, fmt.Errorf("%s: unknown depot, from=%q to=%q", path.Base(f), r.From, r.To)
		}
		if len(r.Coordinates) < 2 {
			return nil, nil, fmt.Errorf("%s: needs at least 2 coordinates", path.Base(f))
		}
	}
	return depots, routes, nil
}

func readJSON(fsys fs.FS, name string, v any) error {
	data, err := fs.ReadFile(fsys, name)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(data, v); err != nil {
		return fmt.Errorf("parse %s: %w", name, err)
	}
	return nil
}

const (
	evVans        = 28
	dieselTrucks  = 12
	charging      = 4 // EV vans only
	inMaintenance = 2
)

// generates the demo fleet with a fixed seed.
func Vehicles(depots []Depot) []Vehicle {
	rng := rand.New(rand.NewPCG(2026, 10))

	fleet := make([]Vehicle, 0, evVans+dieselTrucks)
	for i := 1; i <= evVans; i++ {
		fleet = append(fleet, Vehicle{Name: fmt.Sprintf("VAN-%02d", i), Type: "ev_van"})
	}
	for i := 1; i <= dieselTrucks; i++ {
		fleet = append(fleet, Vehicle{Name: fmt.Sprintf("TRK-%02d", i), Type: "diesel_truck"})
	}

	used := make(map[string]bool)
	for i := range fleet {
		fleet[i].Depot = depots[i%len(depots)].Name // spread evenly across depots
		fleet[i].Status = "idle"
		for {
			p := plate(rng)
			if !used[p] {
				used[p] = true
				fleet[i].Plate = p
				break
			}
		}
	}

	order := rng.Perm(len(fleet))
	var nCharging, nMaintenance int
	for _, i := range order {
		switch {
		case nCharging < charging && fleet[i].Type == "ev_van":
			fleet[i].Status = "charging"
			nCharging++
		case nMaintenance < inMaintenance:
			fleet[i].Status = "maintenance"
			nMaintenance++
		}
	}

	return fleet
}

// returns a California-style plate like "8GSV123". CA skips I, O and Q
// because they look like 1 and 0.
func plate(rng *rand.Rand) string {
	const letters = "ABCDEFGHJKLMNPRSTUVWXYZ"
	b := []byte{byte('1' + rng.IntN(9))}
	for range 3 {
		b = append(b, letters[rng.IntN(len(letters))])
	}
	for range 3 {
		b = append(b, byte('0'+rng.IntN(10)))
	}
	return string(b)
}
