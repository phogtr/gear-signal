package seed

import (
	"testing"

	"github.com/phogtr/gear-signal/fixtures"
)

func TestLoadFixtures(t *testing.T) {
	depots, routes, err := Load(fixtures.FS)
	if err != nil {
		t.Fatal(err)
	}
	if len(depots) != 4 {
		t.Errorf("got %d depots, want 4", len(depots))
	}
	if len(routes) != 15 {
		t.Errorf("got %d routes, want 15", len(routes))
	}
}

func TestVehiclesAreDeterministic(t *testing.T) {
	depots, _, err := Load(fixtures.FS)
	if err != nil {
		t.Fatal(err)
	}
	a, b := Vehicles(depots), Vehicles(depots)
	if len(a) != 40 {
		t.Fatalf("got %d vehicles, want 40", len(a))
	}
	for i := range a {
		if a[i] != b[i] {
			t.Fatalf("run differs at %d: %+v vs %+v", i, a[i], b[i])
		}
	}
}

func TestVehiclesFleetShape(t *testing.T) {
	depots, _, _ := Load(fixtures.FS)
	fleet := Vehicles(depots)

	plates := map[string]bool{}
	status := map[string]int{}
	perDepot := map[string]int{}
	for _, v := range fleet {
		if plates[v.Plate] {
			t.Errorf("duplicate plate %s", v.Plate)
		}
		plates[v.Plate] = true
		status[v.Status]++
		perDepot[v.Depot]++
		if v.Status == "charging" && v.Type != "ev_van" {
			t.Errorf("%s is a %s but charging", v.Name, v.Type)
		}
	}
	if status["charging"] != charging || status["maintenance"] != inMaintenance {
		t.Errorf("statuses = %v", status)
	}
	for name, n := range perDepot {
		if n != 10 {
			t.Errorf("depot %s has %d vehicles, want 10", name, n)
		}
	}
}
