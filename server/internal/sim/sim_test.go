package sim

import (
	"fmt"
	"math"
	"reflect"
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
	eta := start(t, s, Trip{ID: 1, VehicleID: 7, VehicleType: EVVan, RouteID: 1, StartedAt: t0})

	half := eta.Sub(t0) / 2
	a := s.trips[1]
	states := s.Tick(t0.Add(half))
	if len(states) != 1 {
		t.Fatalf("got %d states, want 1", len(states))
	}
	st := states[0]
	length := s.routes[1].line.Length()

	near(t, "distance", st.Distance, a.distanceAt(half.Seconds()), 1e-9)
	near(t, "progress", st.Progress, st.Distance/length, 1e-12)
	near(t, "progress near half", st.Progress, 0.5, a.mean*MaxLagS/length)
	near(t, "speed", st.Speed, a.speedAt(half.Seconds()), 1e-12)
	near(t, "lng", st.Lng, 0.01*st.Progress, 1e-8)
	near(t, "lat", st.Lat, 0, 1e-12)
	near(t, "heading", st.Degree, 90, 1e-9)
	if st.Done || st.VehicleID != 7 || st.TripID != 1 || st.RouteID != 1 {
		t.Errorf("unexpected state %+v", st)
	}
}

func TestTripCompletesOnceAndIsDropped(t *testing.T) {
	s := newSim(t, 1)
	eta := start(t, s, Trip{ID: 1, VehicleID: 7, VehicleType: EVVan, RouteID: 1, StartedAt: t0})

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
	start(t, s, Trip{ID: 1, VehicleID: 7, VehicleType: EVVan, RouteID: 1, StartedAt: t0})

	st := s.Tick(t0.Add(-time.Second))[0]
	near(t, "distance", st.Distance, 0, 0)
	near(t, "lng", st.Lng, 0, 0)
}

func TestMultiplierSpeedsUpTime(t *testing.T) {
	slow, fast := newSim(t, 1), newSim(t, 10)
	trip := Trip{ID: 1, VehicleID: 7, VehicleType: EVVan, RouteID: 1, StartedAt: t0}
	slowETA, fastETA := start(t, slow, trip), start(t, fast, trip)

	near(t, "eta ratio", slowETA.Sub(t0).Seconds()/fastETA.Sub(t0).Seconds(), 10, 1e-6)

	// 5 s at 10x is the same sim time as 50 s at 1x
	f, sl := fast.Tick(t0.Add(5 * time.Second))[0], slow.Tick(t0.Add(50 * time.Second))[0]
	near(t, "distance", f.Distance, sl.Distance, 1e-6)
	near(t, "speed", f.Speed, sl.Speed, 1e-9)
}

func TestDistanceIsIntegralOfSpeed(t *testing.T) {
	for _, phases := range [][2]float64{{0, 0}, {1, 4}, {math.Pi, 2}, {5, math.Pi}} {
		a := &active{mean: 15, phases: phases}
		// Simpson's rule over 0..600 sim s (5 periods of wave 1, ~2 of wave 2)
		const n, end = 6000, 600.0
		h := end / n
		sum := a.speedAt(0) + a.speedAt(end)
		for i := 1; i < n; i++ {
			w := 2.0
			if i%2 == 1 {
				w = 4
			}
			sum += w * a.speedAt(float64(i)*h)
		}
		near(t, "integral", a.distanceAt(end), sum*h/3, 1e-6)
		near(t, "distance at 0", a.distanceAt(0), 0, 1e-12)
	}
}

func TestETASolvesRouteLength(t *testing.T) {
	length := newSim(t, 1).routes[1].line.Length()
	for id := int64(1); id <= 50; id++ {
		s := newSim(t, 20)
		eta := start(t, s, Trip{ID: id, VehicleID: 7, VehicleType: EVVan, RouteID: 1, StartedAt: t0})
		a := s.trips[id]

		near(t, "distance at arrival", a.distanceAt(a.travel), length, 1e-6)
		if lag := a.travel - length/a.mean; math.Abs(lag) > MaxLagS {
			t.Errorf("trip %d: travel %g s is %g s off the average-speed time, max %g", id, a.travel, lag, MaxLagS)
		}
		if st := s.Tick(eta.Add(-time.Millisecond))[0]; st.Done {
			t.Errorf("trip %d: done before its ETA: %+v", id, st)
		}
		if st := s.Tick(eta.Add(time.Millisecond))[0]; !st.Done {
			t.Errorf("trip %d: not done after its ETA: %+v", id, st)
		}
	}
}

func TestSpeedWavesAroundTripAverageAndSurvivesRestart(t *testing.T) {
	avg := newSim(t, 1).routes[1].avgSpeed
	phases := map[[2]float64]bool{}

	for id := int64(1); id <= 50; id++ {
		trip := Trip{ID: id, VehicleID: id, VehicleType: []string{EVVan, DieselTruck}[id%2], RouteID: 1, StartedAt: t0}
		before, after := newSim(t, 1), newSim(t, 1) // a "restart" between them
		start(t, before, trip)
		start(t, after, trip)

		a := before.trips[id]
		if a.mean != avg*speedFactor(id) {
			t.Errorf("trip %d: mean %g, want route average × speedFactor", id, a.mean)
		}
		phases[a.phases] = true
		for sec := 0; sec <= 600; sec += 7 {
			v := a.speedAt(float64(sec))
			if v < 0.75*a.mean-1e-9 || v > 1.25*a.mean+1e-9 {
				t.Errorf("trip %d at %d s: speed %g outside ±25%% of %g", id, sec, v, a.mean)
			}
		}

		at := t0.Add(40 * time.Second)
		if s1, s2 := before.Tick(at)[0], after.Tick(at)[0]; !reflect.DeepEqual(s1, s2) {
			t.Errorf("trip %d: %+v before restart, %+v after", id, s1, s2)
		}
	}
	if len(phases) < 40 {
		t.Errorf("only %d distinct phases across 50 trips", len(phases))
	}
}

// 120 s and 290 s only line up again after 3480 s sim (174 ticks at SIM_SPEED 20)
func TestSpeedPatternRepeatsOnlyAfterBothPeriods(t *testing.T) {
	a := &active{mean: 15, phases: wavePhases(1)}
	for _, sec := range []float64{0, 37, 200} {
		if math.Abs(a.speedAt(sec+120)-a.speedAt(sec)) < 1e-3 {
			t.Errorf("speed at %g s repeats after 120 s alone", sec)
		}
		near(t, "speed after 3480 s", a.speedAt(sec+3480), a.speedAt(sec), 1e-9)
	}
}

// trips that were running before the wave existed keep their average speed
func TestSpeedFactorUnchanged(t *testing.T) {
	for id, want := range map[int64]float64{1: 0.94768463817477488, 2: 1.0653956240185063, 42: 0.95067013335597961} {
		if got := speedFactor(id); got != want {
			t.Errorf("speedFactor(%d) = %.17g, want %.17g", id, got, want)
		}
	}
}

func TestResumedTripContinuesWhereItWouldBe(t *testing.T) {
	s := newSim(t, 1)
	start(t, s, Trip{ID: 1, VehicleID: 7, VehicleType: EVVan, RouteID: 1, StartedAt: t0.Add(-30 * time.Second)})

	st := s.Tick(t0)[0]
	near(t, "distance after 30 s", st.Distance, s.trips[1].distanceAt(30), 1e-9)
}

func TestTickSortsByVehicle(t *testing.T) {
	s := newSim(t, 1)
	for _, v := range []int64{9, 2, 5} {
		start(t, s, Trip{ID: v, VehicleID: v, VehicleType: EVVan, RouteID: 1, StartedAt: t0})
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
	if _, err := s.Start(Trip{ID: 1, VehicleType: EVVan, RouteID: 99, StartedAt: t0}); err == nil {
		t.Error("unknown route: want error")
	}
	start(t, s, Trip{ID: 1, VehicleType: EVVan, RouteID: 1, StartedAt: t0})
	if _, err := s.Start(Trip{ID: 1, VehicleType: EVVan, RouteID: 1, StartedAt: t0}); err == nil {
		t.Error("duplicate trip: want error")
	}
	if _, err := s.Start(Trip{ID: 2, VehicleType: "bike", RouteID: 1, StartedAt: t0}); err == nil {
		t.Error("unknown vehicle type: want error")
	}
}

func TestTelemetryByVehicleType(t *testing.T) {
	s := newSim(t, 1)
	start(t, s, Trip{ID: 1, VehicleID: 1, VehicleType: EVVan, RouteID: 1, StartedAt: t0})
	start(t, s, Trip{ID: 2, VehicleID: 2, VehicleType: DieselTruck, RouteID: 1, StartedAt: t0})

	states := s.Tick(t0.Add(10 * time.Second))
	if ev := states[0]; ev.Battery == nil || ev.Fuel != nil || ev.EngineTemp != nil {
		t.Errorf("EV: want battery only, got %+v", ev)
	}
	if d := states[1]; d.Battery != nil || d.Fuel == nil || d.EngineTemp == nil {
		t.Errorf("diesel: want fuel and engine temp only, got %+v", d)
	}
}

func TestLevelsDrainByDistance(t *testing.T) {
	for _, tt := range []struct {
		vehicleType string
		perKm       float64
	}{{EVVan, 0.004}, {DieselTruck, 0.35 / 300}} {
		s := newSim(t, 1)
		eta := start(t, s, Trip{ID: 3, VehicleID: 1, VehicleType: tt.vehicleType, RouteID: 1, StartedAt: t0})
		level := func(st State) float64 {
			if st.Battery != nil {
				return *st.Battery
			}
			return *st.Fuel
		}

		first := s.Tick(t0)[0]
		initial := startLevel(3)
		if initial < 0.55 || initial > 0.95 {
			t.Errorf("start level %g outside 55-95%%", initial)
		}
		near(t, tt.vehicleType+" level at start", level(first), initial, 1e-12)

		mid := s.Tick(t0.Add(30 * time.Second))[0]
		near(t, tt.vehicleType+" level mid-trip", level(mid), initial-tt.perKm*mid.Distance/1000, 1e-12)

		end := s.Tick(eta.Add(time.Second))[0]
		near(t, tt.vehicleType+" level at arrival", level(end), initial-tt.perKm*end.Distance/1000, 1e-12)
	}
}

func TestEngineWarmsUp(t *testing.T) {
	// 1° east ≈ 111 km in an hour, long enough to reach operating temperature
	long := Route{ID: 2, Points: []geo.Point{{0, 0}, {1, 0}}, DurationS: 3600}
	s, err := New([]Route{long}, 1)
	if err != nil {
		t.Fatal(err)
	}
	start(t, s, Trip{ID: 1, VehicleID: 1, VehicleType: DieselTruck, RouteID: 2, StartedAt: t0})

	for _, tt := range []struct {
		sec  int
		want float64
	}{
		{0, 25},
		{180, 90 - 65*math.Exp(-1)}, // one time constant: 63% of the way
		{1800, 90},
	} {
		st := s.Tick(t0.Add(time.Duration(tt.sec) * time.Second))[0]
		near(t, fmt.Sprintf("engine temp at %d s", tt.sec), *st.EngineTemp, tt.want, 1.01)
	}
}

func TestNoiseIsDeterministicPerSimSecond(t *testing.T) {
	seen := map[float64]bool{}
	for sec := range 100 {
		n := noise(1, float64(sec)+0.2)
		if n < -1 || n > 1 {
			t.Errorf("noise %g outside ±1", n)
		}
		if again := noise(1, float64(sec)+0.9); again != n {
			t.Errorf("second %d: %g then %g within the same second", sec, n, again)
		}
		seen[n] = true
	}
	if len(seen) < 95 {
		t.Errorf("only %d distinct values in 100 seconds", len(seen))
	}
	if noise(1, 5) == noise(2, 5) {
		t.Error("two trips share the same noise")
	}
}
