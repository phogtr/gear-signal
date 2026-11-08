package alert

import (
	"slices"
	"testing"
	"time"

	"github.com/phogtr/gear-signal/fixtures"
	"github.com/phogtr/gear-signal/internal/geo"
	"github.com/phogtr/gear-signal/internal/seed"
	"github.com/phogtr/gear-signal/internal/sim"
)

var t0 = time.Date(2026, 11, 1, 9, 0, 0, 0, time.UTC)

// 0.1° north from LA city hall ≈ 11 km
var north = []geo.Point{{-118.24, 34.05}, {-118.24, 34.15}}

func newEvaluator(t *testing.T) *Evaluator {
	t.Helper()
	line, err := geo.NewPolyline(north)
	if err != nil {
		t.Fatal(err)
	}
	return New(map[int64]*geo.Polyline{1: line})
}

func onRoute(kmh float64) sim.State {
	p := geo.Point{-118.24, 34.1}
	return sim.State{VehicleID: 7, TripID: 3, RouteID: 1, Distance: geo.Distance(north[0], p), Lat: p.Lat(), Lng: p.Lng(), Speed: kmh / 3.6}
}

func codes(events []Event) []string {
	out := make([]string, len(events))
	for i, ev := range events {
		out[i] = ev.Severity + " " + ev.Code
	}
	return out
}

func TestSpeedingHysteresis(t *testing.T) {
	e := newEvaluator(t)
	steps := []struct {
		kmh  float64
		want []string
	}{
		{90, nil},
		{105, nil}, // at the threshold is not over it
		{110, []string{"warning SPEEDING"}},
		{130, nil}, // still raised
		{102, nil}, // between clear and raise
		{106, nil},
		{99, []string{"info SPEEDING"}},
		{104, nil},
		{107, []string{"warning SPEEDING"}},
	}
	for i, st := range steps {
		got := codes(e.Eval(t0.Add(time.Duration(i)*time.Second), []sim.State{onRoute(st.kmh)}))
		if !slices.Equal(got, st.want) {
			t.Errorf("step %d (%g km/h): got %v, want %v", i, st.kmh, got, st.want)
		}
	}
}

func TestEventFields(t *testing.T) {
	e := newEvaluator(t)
	now := t0.Add(5 * time.Second)

	got := e.Eval(now, []sim.State{onRoute(118.4)})
	want := Event{TripID: 3, VehicleID: 7, Severity: Warning, Code: Speeding, Message: "Speeding at 118 km/h", TS: now}
	if len(got) != 1 || got[0] != want {
		t.Fatalf("got %+v, want %+v", got, want)
	}

	got = e.Eval(now, []sim.State{onRoute(97.6)})
	if len(got) != 1 || got[0].Message != "Speed back to 98 km/h" || got[0].Severity != Info {
		t.Errorf("clear: got %+v", got)
	}
}

func TestOverheat(t *testing.T) {
	e := newEvaluator(t)
	for _, tt := range []struct {
		temp float64
		want []string
	}{
		{104.9, nil},
		{106.2, []string{"critical OVERHEAT"}},
		{100.5, nil},
		{99.4, []string{"info OVERHEAT"}},
	} {
		s := onRoute(60)
		s.EngineTemp = &tt.temp
		if got := codes(e.Eval(t0, []sim.State{s})); !slices.Equal(got, tt.want) {
			t.Errorf("%g °C: got %v, want %v", tt.temp, got, tt.want)
		}
	}
}

func TestBatteryLowIsBelow(t *testing.T) {
	e := newEvaluator(t)
	for _, tt := range []struct {
		level float64
		want  []string
	}{
		{0.21, nil},
		{0.19, []string{"warning BATTERY_LOW"}},
		{0.10, nil},
		{0.24, nil},
		{0.26, []string{"info BATTERY_LOW"}},
	} {
		s := onRoute(60)
		s.Battery = &tt.level
		if got := codes(e.Eval(t0, []sim.State{s})); !slices.Equal(got, tt.want) {
			t.Errorf("%g: got %v, want %v", tt.level, got, tt.want)
		}
	}
}

func TestRouteDeviation(t *testing.T) {
	e := newEvaluator(t)
	for _, tt := range []struct {
		off  float64 // meters east of the route
		want []string
	}{
		{0, nil},
		{140, nil},
		{160, []string{"critical ROUTE_DEVIATION"}},
		{300, nil},
		{120, nil},
		{90, []string{"info ROUTE_DEVIATION"}},
	} {
		s := onRoute(60)
		p := geo.Destination(geo.Point{s.Lng, s.Lat}, 90, tt.off)
		s.Lng, s.Lat = p.Lng(), p.Lat()
		if got := codes(e.Eval(t0, []sim.State{s})); !slices.Equal(got, tt.want) {
			t.Errorf("%g m: got %v, want %v", tt.off, got, tt.want)
		}
	}
}

// a detour that lands on the way back of a loop is still off route
func TestRouteDeviationOnLoopingRoute(t *testing.T) {
	out := north[0]
	back := geo.Destination(out, 90, 250).Lng()
	loop, err := geo.NewPolyline([]geo.Point{out, north[1], {back, north[1].Lat()}, {back, out.Lat()}})
	if err != nil {
		t.Fatal(err)
	}
	e := New(map[int64]*geo.Polyline{1: loop})

	s := onRoute(60)
	p := geo.Destination(geo.Point{s.Lng, s.Lat}, 90, 250)
	s.Lng, s.Lat = p.Lng(), p.Lat()
	if d := geo.Distance(p, geo.Point{back, p.Lat()}); d > 1 {
		t.Fatalf("test setup: %g m from the way back, want on it", d)
	}
	if got := codes(e.Eval(t0, []sim.State{s})); !slices.Equal(got, []string{"critical ROUTE_DEVIATION"}) {
		t.Errorf("got %v", got)
	}
}

func TestUnknownRouteSkipsDeviation(t *testing.T) {
	e := newEvaluator(t)
	s := onRoute(60)
	s.RouteID, s.Lng = 99, 0
	if got := e.Eval(t0, []sim.State{s}); len(got) != 0 {
		t.Errorf("got %+v", got)
	}
}

func TestAlertsPerTrip(t *testing.T) {
	e := newEvaluator(t)
	a, b := onRoute(120), onRoute(120)
	b.TripID, b.VehicleID = 4, 8

	if got := e.Eval(t0, []sim.State{a, b}); len(got) != 2 {
		t.Fatalf("got %d events, want one per trip", len(got))
	}
	a.Speed = 0
	got := e.Eval(t0, []sim.State{a, b})
	if len(got) != 1 || got[0].TripID != 3 || got[0].Severity != Info {
		t.Errorf("only trip 3 clears: got %+v", got)
	}
}

func TestDoneForgetsRaisedAlerts(t *testing.T) {
	e := newEvaluator(t)
	low := 0.1
	s := onRoute(60)
	s.Battery = &low

	e.Eval(t0, []sim.State{s})
	s.Done = true
	if got := e.Eval(t0, []sim.State{s}); len(got) != 0 {
		t.Errorf("done tick: got %+v, want no clear", got)
	}
	if len(e.alerted) != 0 {
		t.Errorf("alerted not forgotten: %v", e.alerted)
	}
}

// every simulated fault raises its alert once and clears it once on the real
// LA routes, despite the speed waves, engine temp noise and winding roads
func TestSimulatedFaults(t *testing.T) {
	_, routes, err := seed.Load(fixtures.FS)
	if err != nil {
		t.Fatal(err)
	}

	seen := map[string]int{}
	trips := 0
	for r, route := range routes {
		line, err := geo.NewPolyline(route.Coordinates)
		if err != nil {
			t.Fatal(err)
		}
		simRoute := sim.Route{ID: 1, Points: route.Coordinates, DurationS: route.DurationS}

		for k := range 40 {
			id := int64(r*1000 + k)
			s, err := sim.New([]sim.Route{simRoute}, 20)
			if err != nil {
				t.Fatal(err)
			}
			vehicleType := sim.DieselTruck
			if id%2 == 0 {
				vehicleType = sim.EVVan
			}
			if _, err := s.Start(sim.Trip{ID: id, VehicleID: 1, VehicleType: vehicleType, RouteID: 1, StartedAt: t0, Res: 0.9}); err != nil {
				t.Fatal(err)
			}
			trips++

			e := New(map[int64]*geo.Polyline{1: line})
			var got []Event
			for sec := 0; ; sec++ {
				states := s.Tick(t0.Add(time.Duration(sec) * time.Second))
				if len(states) == 0 {
					break
				}
				got = append(got, e.Eval(t0, states)...)
			}

			switch {
			case len(got) == 0:
			case len(got) == 2 && got[0].Severity != Info && got[1].Severity == Info && got[0].Code == got[1].Code:
				seen[got[0].Code]++
			default:
				t.Errorf("%s trip %d (%s): got %v, want nothing or one raise and its clear", route.Name, id, vehicleType, codes(got))
			}
		}
	}

	// ~15% of trips have a fault
	faulty := seen[Speeding] + seen[Overheat] + seen[RouteDeviation]
	if want := trips * 15 / 100; faulty < want/2 || faulty > want*2 || seen[Speeding] == 0 || seen[Overheat] == 0 || seen[RouteDeviation] == 0 {
		t.Errorf("alerted trips by code %v, want ~%d of %d covering all three faults", seen, want, trips)
	}
}
