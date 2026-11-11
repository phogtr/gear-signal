package schedule

import (
	"errors"
	"math"
	"strings"
	"testing"
	"time"

	"github.com/phogtr/gear-signal/internal/sim"
	"github.com/phogtr/gear-signal/internal/store"
)

var now = time.Date(2026, 10, 17, 16, 0, 0, 0, time.UTC)

func at(h, m int) time.Time { return time.Date(2026, 10, 17, h, m, 0, 0, time.UTC) }

// depot 1 -> 2 takes 900 s at free flow, so it reserves 1000 s (16 min 40 s)
// plus the speed waves' ~15 s at SIM_SPEED 1
var (
	there        = store.Route{ID: 10, Name: "a-b", OriginDepotID: 1, DestinationDepotID: 2, DurationS: 900, DistanceM: 41_000}  // EV: 16.4 points, needs 31.4
	back         = store.Route{ID: 20, Name: "b-a", OriginDepotID: 2, DestinationDepotID: 1, DurationS: 1800, DistanceM: 61_000} // EV: 24.4 points, needs 39.4
	reserveThere = Reserve(there.DurationS, 1)
	reserveBack  = Reserve(back.DurationS, 1)
)

func planned(id int64, r store.Route, start time.Time) store.PlannedTrip {
	return store.PlannedTrip{
		ID: id, Status: "scheduled", ScheduledStart: start,
		OriginDepotID: r.OriginDepotID, DestinationDepotID: r.DestinationDepotID, DurationS: r.DurationS, DistanceM: r.DistanceM,
	}
}

func active(id int64, r store.Route, started time.Time, eta *time.Time) store.PlannedTrip {
	t := planned(id, r, started)
	t.Status = "active"
	t.StartedAt = &started
	t.ETA = eta
	return t
}

func plan(status string, depot int64, trips ...store.PlannedTrip) store.Plan {
	return store.Plan{
		Vehicle: store.Vehicle{ID: 7, Name: "VAN-07", Status: status, DepotID: depot},
		Trips:   trips,
	}
}

func kind(err error) error {
	var se *Error
	if errors.As(err, &se) {
		return se.Kind
	}
	return nil
}

func TestReserve(t *testing.T) {
	// the wave lag is 2·0.15/(2π/120 s) + 2·0.1/(2π/290 s) = 18/π + 29/π ≈ 14.96 s
	lag := 47 / math.Pi
	tests := []struct {
		durationS int
		simSpeed  float64
		want      float64 // seconds
	}{
		{900, 1, 1000 + lag},
		{900, 20, (1000 + lag) / 20},
	}
	for _, tt := range tests {
		got := Reserve(tt.durationS, tt.simSpeed)
		if math.Abs(got.Seconds()-tt.want) > 1e-6 {
			t.Errorf("Reserve(%d, %g) = %v, want %.6fs", tt.durationS, tt.simSpeed, got, tt.want)
		}
	}
}

func TestFreeAt(t *testing.T) {
	eta := at(16, 30)
	tests := []struct {
		name  string
		trips []store.PlannedTrip
		want  time.Time
	}{
		{"no trips", nil, time.Time{}},
		{"active trip ends at its ETA", []store.PlannedTrip{active(1, there, at(15, 50), &eta)}, eta},
		{"active trip without ETA yet takes the worst case",
			[]store.PlannedTrip{active(1, there, at(15, 50), nil)}, at(15, 50).Add(reserveThere)},
		{"scheduled trip starts on time",
			[]store.PlannedTrip{planned(1, there, at(17, 0))}, at(17, 0).Add(reserveThere)},
		{"due trip that hasn't started starts now at the earliest",
			[]store.PlannedTrip{planned(1, there, at(15, 0))}, now.Add(reserveThere)},
		{"trip waits for a late trip before it",
			[]store.PlannedTrip{active(1, there, at(15, 50), &eta), planned(2, back, at(16, 20))},
			eta.Add(reserveBack)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := FreeAt(tt.trips, now, 1); !got.Equal(tt.want) {
				t.Errorf("FreeAt = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestAvailable(t *testing.T) {
	overdue := at(15, 55) // an active trip whose ETA passed; the next tick completes it
	tests := []struct {
		name      string
		plan      store.Plan
		wantDepot int64
		wantAt    time.Time
	}{
		{"parked: its depot, now", plan("idle", 1), 1, now},
		{"chain: last trip's destination, when it can be done",
			plan("idle", 1, planned(1, there, at(17, 0))), 2, at(17, 0).Add(reserveThere)},
		{"never earlier than now", plan("en_route", 1, active(1, there, at(15, 40), &overdue)), 2, now},
		// e.g. SIM_SPEED raised since it started: started_at + reserve is already past
		{"never earlier than now without an ETA", plan("en_route", 1, active(1, there, at(15, 0), nil)), 2, now},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			depot, got := Available(tt.plan, now, 1)
			if depot != tt.wantDepot || !got.Equal(tt.wantAt) {
				t.Errorf("Available = depot %d at %v, want depot %d at %v", depot, got, tt.wantDepot, tt.wantAt)
			}
		})
	}
}

func TestCheckCreate(t *testing.T) {
	// trip 1 runs 17:00 to 17:16:55 and ends at depot 2
	chained := plan("idle", 1, planned(1, there, at(17, 0)))

	tests := []struct {
		name  string
		plan  store.Plan
		route store.Route
		start time.Time
		want  error  // nil, ErrInvalid or ErrConflict
		msg   string // substring of the message
	}{
		{"parked vehicle, route from its depot", plan("idle", 1), there, at(17, 0), nil, ""},
		{"en route vehicle chains after its active trip",
			plan("en_route", 1, active(1, there, at(15, 50), new(at(16, 10)))), back, at(16, 10), nil, ""},
		{"chains from where the last trip ends", chained, back, at(17, 30), nil, ""},
		{"starts exactly when the last trip can be done", chained, back, at(17, 0).Add(reserveThere), nil, ""},
		{"maintenance", plan("maintenance", 1), there, at(17, 0), ErrInvalid, "VAN-07 is in maintenance"},
		{"start is now", plan("idle", 1), there, now, ErrInvalid, "in the future"},
		{"start in the past", plan("idle", 1), there, at(15, 0), ErrInvalid, "in the future"},
		{"route leaves another depot", plan("idle", 2), there, at(17, 0), ErrInvalid,
			"route a-b doesn't leave the depot where VAN-07 will be then"},
		{"chain: route must leave the last trip's destination", chained, there, at(18, 0), ErrInvalid,
			"route a-b doesn't leave"},
		{"overlaps the last trip", chained, back, at(17, 10), ErrConflict,
			"VAN-07 is reserved for trip 1 until 17:17 UTC"},
		{"before the last trip", chained, back, at(16, 30), ErrConflict, "trip 1"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := CheckCreate(tt.plan, tt.route, tt.start, now, 1)
			if tt.want == nil {
				if err != nil {
					t.Fatalf("want ok, got %v", err)
				}
				return
			}
			if kind(err) != tt.want {
				t.Fatalf("want %v, got %v", tt.want, err)
			}
			if !strings.Contains(err.Error(), tt.msg) {
				t.Errorf("message %q doesn't contain %q", err, tt.msg)
			}
		})
	}
}

func withRes(p store.Plan, vehicleType string, res float64, chargingSince *time.Time) store.Plan {
	p.Vehicle.Type, p.Vehicle.Res, p.Vehicle.ChargingSince = vehicleType, res, chargingSince
	return p
}

// at SIM_SPEED 1 a charger adds 1 point per minute
func TestPredictRes(t *testing.T) {
	eta := at(16, 10)
	endOfThere := at(17, 0).Add(reserveThere)
	tests := []struct {
		name         string
		plan         store.Plan
		at           time.Time
		want         float64
		wantCharging bool
	}{
		{"idle keeps its level", withRes(plan("idle", 1), sim.EVVan, 80, nil), at(18, 0), 80, false},
		{"charging, now", withRes(plan("charging", 1), sim.EVVan, 30, new(at(15, 30))), now, 60, true},
		{"charging, later", withRes(plan("charging", 1), sim.EVVan, 30, new(at(15, 30))), at(16, 10), 70, true},
		{"charging stops at the cap", withRes(plan("charging", 1), sim.EVVan, 30, new(at(15, 30))), at(18, 0), 90, true},
		{"charges until the first trip, then drains",
			withRes(plan("charging", 1, planned(1, there, at(16, 10))), sim.EVVan, 30, new(at(15, 30))), at(18, 0), 53.6, false},
		{"active trip drains from the level it left with",
			withRes(plan("en_route", 1, active(1, there, at(15, 50), &eta)), sim.EVVan, 70, nil), at(18, 0), 53.6, false},
		{"arrives below 40: charges from its ETA",
			withRes(plan("en_route", 1, active(1, there, at(15, 50), &eta)), sim.EVVan, 50, nil), at(16, 20), 43.6, true},
		{"arrives below 40: charges from the worst-case end",
			withRes(plan("idle", 1, planned(1, there, at(17, 0))), sim.EVVan, 40, nil), endOfThere.Add(10 * time.Minute), 33.6, true},
		{"not before it arrives",
			withRes(plan("idle", 1, planned(1, there, at(17, 0))), sim.EVVan, 40, nil), endOfThere, 23.6, true},
		{"a chain charges in each gap",
			withRes(plan("en_route", 1, active(1, there, at(15, 50), &eta), planned(2, back, at(16, 40))), sim.EVVan, 50, nil),
			at(16, 40).Add(reserveBack), 33.6 + 30 - 24.4, true},
		{"never below 0",
			withRes(plan("idle", 1, planned(1, there, at(17, 0))), sim.EVVan, 10, nil), endOfThere, 0, true},
		{"truck refuels below 40",
			withRes(plan("en_route", 1, active(1, there, at(15, 50), &eta)), sim.DieselTruck, 42, nil), at(18, 0), 100, false},
		{"truck above 40 keeps its fuel",
			withRes(plan("en_route", 1, active(1, there, at(15, 50), &eta)), sim.DieselTruck, 60, nil), at(18, 0), 60 - sim.Drain(sim.DieselTruck, 41_000), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res, since := Predict(tt.plan, now, 1)
			got := sim.Charged(res, since, tt.at, 1)
			if math.Abs(got-tt.want) > 1e-6 || (since != nil) != tt.wantCharging {
				t.Errorf("level = %g, since %v; want %g, charging %v", got, since, tt.want, tt.wantCharging)
			}
		})
	}
}

func TestRouteStart(t *testing.T) {
	eta := at(16, 10)
	tests := []struct {
		name  string
		plan  store.Plan
		route store.Route
		want  time.Time // zero: the battery never covers it
	}{
		{"idle with enough: now", withRes(plan("idle", 1), sim.EVVan, 80, nil), there, now},
		{"idle, too low: never", withRes(plan("idle", 2), sim.EVVan, 39.3, nil), back, time.Time{}},
		{"charging with enough: now", withRes(plan("charging", 1), sim.EVVan, 40, new(at(15, 59))), there, now},
		// 20 -> 31.4 at 1 point per minute: 11 min 24 s after plug-in
		{"charging, too low: when it has enough", withRes(plan("charging", 1), sim.EVVan, 20, new(at(16, 0))), there,
			at(16, 11).Add(24 * time.Second)},
		// arrives at 13.6, 39.4 needs 25 min 48 s more
		{"chain, too low on arrival: when it has enough",
			withRes(plan("en_route", 1, active(1, there, at(15, 50), &eta)), sim.EVVan, 30, nil), back,
			at(16, 35).Add(48 * time.Second)},
		{"chain with enough on arrival: when free",
			withRes(plan("en_route", 1, active(1, there, at(15, 50), &eta)), sim.EVVan, 80, nil), back, eta},
		{"truck: when free, whatever its fuel", withRes(plan("idle", 1), sim.DieselTruck, 5, nil), there, now},
		{"more than a charge can give: never",
			withRes(plan("charging", 1), sim.EVVan, 20, new(at(16, 0))),
			store.Route{ID: 30, Name: "far", OriginDepotID: 1, DestinationDepotID: 2, DistanceM: 200_000}, time.Time{}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := RouteStart(tt.plan, tt.route, now, 1)
			if ok != !tt.want.IsZero() {
				t.Fatalf("RouteStart = %v, %v; want %v", got, ok, tt.want)
			}
			if d := got.Sub(tt.want); d < 0 || d > time.Second {
				t.Errorf("RouteStart = %v, want %v (up to 1 s later)", got, tt.want)
			}

			// the form trusts this: POST /trips must agree on both sides of it
			start := got
			if !start.After(now) {
				start = now.Add(time.Nanosecond)
			}
			if !ok {
				start = at(23, 0)
			}
			err := CheckCreate(tt.plan, tt.route, start, now, 1)
			if ok && err != nil {
				t.Errorf("CheckCreate at the earliest start: %v", err)
			}
			if !ok && kind(err) != ErrInvalid {
				t.Errorf("never covered, but CheckCreate = %v", err)
			}
			if earlier := got.Add(-1100 * time.Millisecond); ok && got.After(now) && earlier.After(FreeAt(tt.plan.Trips, now, 1)) {
				if err := CheckCreate(tt.plan, tt.route, earlier, now, 1); kind(err) != ErrInvalid {
					t.Errorf("1.1 s earlier, CheckCreate = %v, want invalid", err)
				}
			}
		})
	}
}

func TestCheckCreateBattery(t *testing.T) {
	eta := at(16, 10)
	// arrives at 13.6 from 30, so 23.6 at 16:20 and 43.6 at 16:40
	chain := withRes(plan("en_route", 1, active(1, there, at(15, 50), &eta)), sim.EVVan, 30, nil)
	pluggedIn := func(res float64) store.Plan {
		return withRes(plan("charging", 1), sim.EVVan, res, new(at(15, 59).Add(30*time.Second)))
	}

	tests := []struct {
		name  string
		plan  store.Plan
		route store.Route
		start time.Time
		msg   string // empty when allowed
	}{
		{"idle with enough", withRes(plan("idle", 2), sim.EVVan, 39.5, nil), back, at(17, 0), ""},
		{"idle, too low", withRes(plan("idle", 2), sim.EVVan, 39.3, nil), back, at(17, 0),
			"VAN-07 will have 39% battery by then; route b-a needs 40%, including a 15% reserve"},
		{"charging, too soon: 25.5 at 16:05", pluggedIn(20), there, at(16, 5),
			"VAN-07 will have 25% battery by then; route a-b needs 32%, including a 15% reserve; pick a later start"},
		{"charging, later: 35.5 at 16:15", pluggedIn(20), there, at(16, 15), ""},
		{"chain, too soon", chain, back, at(16, 20), "will have 23% battery by then; route b-a needs 40%"},
		{"chain, after charging in the gap", chain, back, at(16, 40), ""},
		{"truck is not checked", withRes(plan("idle", 1), sim.DieselTruck, 5, nil), there, at(17, 0), ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := CheckCreate(tt.plan, tt.route, tt.start, now, 1)
			if tt.msg == "" {
				if err != nil {
					t.Fatalf("want ok, got %v", err)
				}
				return
			}
			if kind(err) != ErrInvalid || !strings.Contains(err.Error(), tt.msg) {
				t.Errorf("want invalid containing %q, got %v", tt.msg, err)
			}
		})
	}

	t.Run("a later start can't help an idle EV", func(t *testing.T) {
		err := CheckCreate(withRes(plan("idle", 2), sim.EVVan, 39.3, nil), back, at(17, 0), now, 1)
		if err == nil || strings.Contains(err.Error(), "later start") {
			t.Errorf("got %v", err)
		}
	})

	t.Run("an overlap is reported first", func(t *testing.T) {
		low := withRes(plan("idle", 1, planned(1, there, at(17, 0))), sim.EVVan, 17, nil)
		if err := CheckCreate(low, back, at(17, 10), now, 1); kind(err) != ErrConflict {
			t.Errorf("want conflict, got %v", err)
		}
	})
}

func TestCheckCancel(t *testing.T) {
	p := plan("en_route", 1,
		active(1, there, at(15, 50), nil),
		planned(2, back, at(17, 0)),
		planned(3, there, at(18, 0)),
	)
	tests := []struct {
		name string
		trip store.Trip
		msg  string // empty when cancelling is allowed
	}{
		{"last scheduled trip", store.Trip{ID: 3, Status: "scheduled"}, ""},
		{"a later trip depends on it", store.Trip{ID: 2, Status: "scheduled"}, "trip 3 starts where this one ends"},
		{"active", store.Trip{ID: 1, Status: "active"}, "trip 1 is active"},
		{"completed", store.Trip{ID: 9, Status: "completed"}, "trip 9 is completed"},
		{"already cancelled", store.Trip{ID: 9, Status: "cancelled"}, "trip 9 is cancelled"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := CheckCancel(p, tt.trip)
			if tt.msg == "" {
				if err != nil {
					t.Fatalf("want ok, got %v", err)
				}
				return
			}
			if kind(err) != ErrConflict || !strings.Contains(err.Error(), tt.msg) {
				t.Errorf("want conflict containing %q, got %v", tt.msg, err)
			}
		})
	}
}
