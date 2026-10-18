package sim

import (
	"math"
	"testing"
	"time"

	"github.com/phogtr/gear-signal/internal/geo"
)

var t0 = time.Date(2026, 10, 10, 9, 0, 0, 0, time.UTC)

// 0.01° east along the equator ≈ 1,112 m, driven in 100 s on average.
var east = Route{ID: 1, Points: []geo.Point{{0, 0}, {0.01, 0}}, DurationS: 100}

func near(t *testing.T, name string, got, want, tol float64) {
	t.Helper()
	if math.Abs(got-want) > tol {
		t.Errorf("%s = %.4f, want %.4f ± %g", name, got, want, tol)
	}
}

func newSim(t *testing.T, multiplier float64) *Sim {
	t.Helper()
	s, err := New([]Route{east}, multiplier)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func start(t *testing.T, s *Sim, trip Trip) time.Time {
	t.Helper()
	eta, err := s.Start(trip)
	if err != nil {
		t.Fatal(err)
	}
	return eta
}

func TestTickHalfway(t *testing.T) {
	s := newSim(t, 1)
	eta := start(t, s, Trip{ID: 1, VehicleID: 7, RouteID: 1, StartedAt: t0})

	states := s.Tick(t0.Add(eta.Sub(t0) / 2))
	if len(states) != 1 {
		t.Fatalf("got %d states, want 1", len(states))
	}
	st := states[0]
	length := s.routes[1].line.Length()

	near(t, "progress", st.Progress, 0.5, 1e-6)
	near(t, "distance", st.Distance, length/2, 1e-3)
	near(t, "lng", st.Lng, 0.005, 1e-8)
	near(t, "lat", st.Lat, 0, 1e-12)
	near(t, "heading", st.Degree, 90, 1e-9)
	if st.Done || st.VehicleID != 7 || st.TripID != 1 || st.RouteID != 1 {
		t.Errorf("unexpected state %+v", st)
	}
}

func TestTripCompletesOnceAndIsDropped(t *testing.T) {
	s := newSim(t, 1)
	eta := start(t, s, Trip{ID: 1, VehicleID: 7, RouteID: 1, StartedAt: t0})

	st := s.Tick(eta.Add(time.Minute))[0]
	if !st.Done || st.Speed != 0 {
		t.Errorf("want done and stopped, got %+v", st)
	}
	near(t, "distance clamped to length", st.Distance, s.routes[1].line.Length(), 1e-9)
	near(t, "progress", st.Progress, 1, 0)

	if got := s.Tick(eta.Add(2 * time.Minute)); len(got) != 0 {
		t.Errorf("finished trip still ticking: %+v", got)
	}
}

func TestTickBeforeStartStaysAtOrigin(t *testing.T) {
	s := newSim(t, 1)
	start(t, s, Trip{ID: 1, VehicleID: 7, RouteID: 1, StartedAt: t0})

	st := s.Tick(t0.Add(-time.Second))[0]
	near(t, "distance", st.Distance, 0, 0)
	near(t, "lng", st.Lng, 0, 0)
}

func TestMultiplierSpeedsUpTime(t *testing.T) {
	slow, fast := newSim(t, 1), newSim(t, 10)
	trip := Trip{ID: 1, VehicleID: 7, RouteID: 1, StartedAt: t0}
	slowETA, fastETA := start(t, slow, trip), start(t, fast, trip)

	near(t, "eta ratio", slowETA.Sub(t0).Seconds()/fastETA.Sub(t0).Seconds(), 10, 1e-6)

	at := t0.Add(5 * time.Second)
	near(t, "distance ratio", fast.Tick(at)[0].Distance/slow.Tick(at)[0].Distance, 10, 1e-9)
}

func TestETAMatchesSpeed(t *testing.T) {
	s := newSim(t, 1)
	eta := start(t, s, Trip{ID: 3, VehicleID: 7, RouteID: 1, StartedAt: t0})

	speed := s.Tick(t0)[0].Speed
	near(t, "eta seconds", eta.Sub(t0).Seconds(), s.routes[1].line.Length()/speed, 1e-6)
}

func TestSpeedVariesWithinTenPercentAndSurvivesRestart(t *testing.T) {
	avg := newSim(t, 1).routes[1].avgSpeed
	seen := map[float64]bool{}

	for id := int64(1); id <= 50; id++ {
		trip := Trip{ID: id, VehicleID: id, RouteID: 1, StartedAt: t0}
		before, after := newSim(t, 1), newSim(t, 1) // a "restart" between them
		start(t, before, trip)
		start(t, after, trip)

		v1, v2 := before.Tick(t0)[0].Speed, after.Tick(t0)[0].Speed
		if v1 != v2 {
			t.Errorf("trip %d: speed %g before restart, %g after", id, v1, v2)
		}
		if v1 < 0.9*avg || v1 > 1.1*avg {
			t.Errorf("trip %d: speed %g outside ±10%% of %g", id, v1, avg)
		}
		seen[v1] = true
	}
	if len(seen) < 40 {
		t.Errorf("only %d distinct speeds across 50 trips", len(seen))
	}
}

func TestResumedTripContinuesWhereItWouldBe(t *testing.T) {
	s := newSim(t, 1)
	start(t, s, Trip{ID: 1, VehicleID: 7, RouteID: 1, StartedAt: t0.Add(-30 * time.Second)})

	st := s.Tick(t0)[0]
	near(t, "distance after 30 s", st.Distance, 30*st.Speed, 1e-9)
}

func TestTickSortsByVehicle(t *testing.T) {
	s := newSim(t, 1)
	for _, v := range []int64{9, 2, 5} {
		start(t, s, Trip{ID: v, VehicleID: v, RouteID: 1, StartedAt: t0})
	}
	var got []int64
	for _, st := range s.Tick(t0.Add(time.Second)) {
		got = append(got, st.VehicleID)
	}
	if got[0] != 2 || got[1] != 5 || got[2] != 9 {
		t.Errorf("vehicle order = %v, want [2 5 9]", got)
	}
}

func TestErrors(t *testing.T) {
	if _, err := New(nil, 0); err == nil {
		t.Error("multiplier 0: want error")
	}
	if _, err := New([]Route{{ID: 1, Points: []geo.Point{{0, 0}}, DurationS: 10}}, 1); err == nil {
		t.Error("single-point route: want error")
	}
	if _, err := New([]Route{{ID: 1, Points: east.Points, DurationS: 0}}, 1); err == nil {
		t.Error("zero duration: want error")
	}

	s := newSim(t, 1)
	if _, err := s.Start(Trip{ID: 1, RouteID: 99, StartedAt: t0}); err == nil {
		t.Error("unknown route: want error")
	}
	start(t, s, Trip{ID: 1, RouteID: 1, StartedAt: t0})
	if _, err := s.Start(Trip{ID: 1, RouteID: 1, StartedAt: t0}); err == nil {
		t.Error("duplicate trip: want error")
	}
}
