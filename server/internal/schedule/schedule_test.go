package schedule

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/phogtr/gear-signal/internal/store"
)

var now = time.Date(2026, 10, 17, 16, 0, 0, 0, time.UTC)

func at(h, m int) time.Time { return time.Date(2026, 10, 17, h, m, 0, 0, time.UTC) }

// depot 1 -> 2 takes 900 s at free flow, so it reserves 1000 s (16 min 40 s) at SIM_SPEED 1
var (
	there = store.Route{ID: 10, Name: "a-b", OriginDepotID: 1, DestinationDepotID: 2, DurationS: 900}
	back  = store.Route{ID: 20, Name: "b-a", OriginDepotID: 2, DestinationDepotID: 1, DurationS: 1800}
)

func planned(id int64, r store.Route, start time.Time) store.PlannedTrip {
	return store.PlannedTrip{
		ID: id, Status: "scheduled", ScheduledStart: start,
		OriginDepotID: r.OriginDepotID, DestinationDepotID: r.DestinationDepotID, DurationS: r.DurationS,
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
	if got := Reserve(900, 1); got != 1000*time.Second {
		t.Errorf("Reserve(900, 1) = %v, want 1000s", got)
	}
	if got := Reserve(900, 20); got != 50*time.Second {
		t.Errorf("Reserve(900, 20) = %v, want 50s", got)
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
			[]store.PlannedTrip{active(1, there, at(15, 50), nil)}, at(15, 50).Add(1000 * time.Second)},
		{"scheduled trip starts on time",
			[]store.PlannedTrip{planned(1, there, at(17, 0))}, at(17, 0).Add(1000 * time.Second)},
		{"due trip that hasn't started starts now at the earliest",
			[]store.PlannedTrip{planned(1, there, at(15, 0))}, now.Add(1000 * time.Second)},
		{"trip waits for a late trip before it",
			[]store.PlannedTrip{active(1, there, at(15, 50), &eta), planned(2, back, at(16, 20))},
			eta.Add(2000 * time.Second)},
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
			plan("idle", 1, planned(1, there, at(17, 0))), 2, at(17, 0).Add(1000 * time.Second)},
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
	// trip 1 runs 17:00 to 17:16:40 and ends at depot 2
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
		{"starts exactly when the last trip can be done", chained, back, at(17, 0).Add(1000 * time.Second), nil, ""},
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
