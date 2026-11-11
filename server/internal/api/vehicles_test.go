package api

import (
	"testing"
	"time"

	"github.com/phogtr/gear-signal/internal/api/gen"
	"github.com/phogtr/gear-signal/internal/sim"
	"github.com/phogtr/gear-signal/internal/store"
)

func TestToVehicle(t *testing.T) {
	parked := toVehicle(store.Vehicle{ID: 1, Type: "ev_van", Status: "idle", Res: 64}, 20)
	if parked.Res != 0.64 || parked.Charging != nil {
		t.Errorf("idle: res %g, charging %+v", parked.Res, parked.Charging)
	}

	since := time.Date(2026, 11, 7, 9, 0, 0, 0, time.FixedZone("PT", -8*3600))
	v := toVehicle(store.Vehicle{ID: 2, Type: "ev_van", Status: "charging", Res: 30, ChargingSince: &since}, 20)
	c := v.Charging
	if c == nil {
		t.Fatal("charging vehicle has no charging window")
	}
	if v.Res != 0.3 || c.Target != 0.9 {
		t.Errorf("res %g, target %g; want 0.3 and 0.9", v.Res, c.Target)
	}
	if c.Since.Location() != time.UTC || !c.Since.Equal(since) || !c.Until.Equal(since.Add(3*time.Minute)) {
		t.Errorf("window %v .. %v, want UTC, 3 min long", c.Since, c.Until)
	}
}

func TestToAvailability(t *testing.T) {
	now := time.Date(2026, 11, 9, 9, 0, 0, 0, time.FixedZone("PT", -8*3600))
	since := now.Add(-time.Minute)
	routes := []store.Route{
		{ID: 1, OriginDepotID: 1, DistanceM: 25_000}, // needs 25
		{ID: 2, OriginDepotID: 1, DistanceM: 50_000}, // needs 35
		{ID: 3, OriginDepotID: 2, DistanceM: 25_000},
	}
	byRoute := func(a gen.Availability) map[int64]gen.RouteAvailability {
		m := map[int64]gen.RouteAvailability{}
		for _, r := range a.Routes {
			m[r.RouteId] = r
		}
		return m
	}

	// plugged in at 10, 20 points per real minute at 20x, so 30 now
	v := store.Vehicle{ID: 7, Type: sim.EVVan, Status: "charging", DepotID: 1, Res: 10, ChargingSince: &since}
	a := toAvailability(store.Plan{Vehicle: v}, routes, now, 20)
	if a.Res != 0.1 || a.Charging == nil || !a.Charging.Since.Equal(since) || a.Charging.Since.Location() != time.UTC {
		t.Errorf("res %g, charging %+v; want 0.1 from plug-in, UTC", a.Res, a.Charging)
	}
	got := byRoute(a)
	if len(got) != 2 {
		t.Fatalf("routes %+v, want only those leaving depot 1", a.Routes)
	}
	if r := got[1]; r.EarliestAt == nil || !r.EarliestAt.Equal(now) || r.EarliestAt.Location() != time.UTC {
		t.Errorf("route 1 has enough now: %+v", r)
	}
	if r := got[2]; r.Need == nil || *r.Need < 0.349 || *r.Need > 0.351 || r.EarliestAt == nil ||
		r.EarliestAt.Before(now.Add(15*time.Second)) || r.EarliestAt.After(now.Add(16*time.Second)) {
		t.Errorf("route 2 needs 35, 15 s of charge away: %+v", r)
	}

	truck := store.Vehicle{ID: 8, Type: sim.DieselTruck, Status: "idle", DepotID: 1, Res: 5}
	if r := byRoute(toAvailability(store.Plan{Vehicle: truck}, routes, now, 20))[2]; r.Need != nil || r.EarliestAt == nil {
		t.Errorf("truck: %+v, want no need and a start", r)
	}

	low := store.Vehicle{ID: 9, Type: sim.EVVan, Status: "idle", DepotID: 1, Res: 30}
	if r := byRoute(toAvailability(store.Plan{Vehicle: low}, routes, now, 20))[2]; r.Need == nil || r.EarliestAt != nil {
		t.Errorf("idle below need: %+v, want a need and no start", r)
	}

	broken := store.Vehicle{ID: 10, Type: sim.EVVan, Status: "maintenance", DepotID: 1, Res: 80}
	if a := toAvailability(store.Plan{Vehicle: broken}, routes, now, 20); a.Routes == nil || len(a.Routes) != 0 {
		t.Errorf("maintenance: routes %+v, want empty, not null", a.Routes)
	}
}
